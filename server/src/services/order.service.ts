/**
 * Order business logic.
 *
 * Three rules govern this module:
 *
 *   1. PRICES COME FROM THE DATABASE. The client sends food ids and
 *      quantities; it never sends a price or a total. Anything else is a
 *      "change the price in DevTools" vulnerability.
 *   2. WRITES ARE ATOMIC. An order and its items are created in one
 *      transaction. A half-written order is corrupt data, not a small bug.
 *   3. STATUS MOVES THROUGH A STATE MACHINE. Illegal transitions are
 *      rejected, not merely discouraged by the UI.
 */

import crypto from "node:crypto";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { applyPercent, fromMinorUnits, toMinorUnits } from "../utils/money.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import {
  emitOrderCancelled,
  emitOrderCreated,
  emitOrderStatusChanged,
  emitOrderUpdated,
} from "../socket/index.js";
import {
  notifyOrderPlaced,
  notifyOrderStatus,
} from "./notification.service.js";
import type {
  AddItemsInput,
  OrderListQuery,
  OrderStatus,
  PlaceOrderInput,
} from "../validations/order.validation.js";

/** Prisma transaction client — the type $transaction hands to its callback. */
type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const orderInclude = {
  items: true,
  table: { select: { id: true, tableNumber: true } },
  customer: { select: { id: true, name: true, phone: true } },
  handledBy: { select: { id: true, fullName: true } },
} satisfies Prisma.OrderInclude;

// ---------------------------------------------------------------------------
// Status state machine
// ---------------------------------------------------------------------------

/**
 * Legal status transitions.
 *
 * Encoded as data rather than a chain of if-statements: the whole workflow is
 * readable at a glance, and adding a status is a one-line change.
 *
 * SERVED and CANCELLED are terminal — an order that reached either cannot
 * move again, which is what stops a served order being silently reopened.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

/** Statuses during which the order contents may still change. */
const EDITABLE_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED"];

/** Timestamp column stamped when each status is entered. */
const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "confirmedAt",
  PREPARING: "preparedAt",
  READY: "readyAt",
  SERVED: "servedAt",
  CANCELLED: "cancelledAt",
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  ALLOWED_TRANSITIONS[from].includes(to);

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

interface PricedItem {
  foodId: string;
  foodName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  notes?: string;
}

/**
 * Resolves requested items against the live menu and prices them.
 *
 * Every price and name here is read from the database, then SNAPSHOT onto the
 * order item, so later menu edits cannot rewrite what the customer was
 * charged.
 */
const priceItems = async (
  tx: TxClient,
  requested: { foodId: string; quantity: number; notes?: string }[]
): Promise<{ items: PricedItem[]; subtotalMinor: number }> => {
  const foodIds = [...new Set(requested.map((item) => item.foodId))];

  const foods = await tx.food.findMany({
    where: { id: { in: foodIds }, deletedAt: null },
    select: { id: true, name: true, price: true, isAvailable: true },
  });

  const foodById = new Map(foods.map((food) => [food.id, food]));

  const items: PricedItem[] = [];
  let subtotalMinor = 0;

  for (const request of requested) {
    const food = foodById.get(request.foodId);

    if (!food) {
      throw AppError.badRequest(`Menu item not found: ${request.foodId}`);
    }

    // Availability is re-checked here, inside the transaction, rather than
    // trusted from whenever the customer loaded the menu.
    if (!food.isAvailable) {
      throw AppError.conflict(`"${food.name}" is sold out`);
    }

    const unitMinor = toMinorUnits(food.price.toString());
    const lineMinor = unitMinor * request.quantity;

    subtotalMinor += lineMinor;

    items.push({
      foodId: food.id,
      foodName: food.name,
      unitPrice: fromMinorUnits(unitMinor),
      quantity: request.quantity,
      lineTotal: fromMinorUnits(lineMinor),
      notes: request.notes,
    });
  }

  return { items, subtotalMinor };
};

/** Reads tax and service charge from the settings singleton. */
const loadCharges = async (tx: TxClient) => {
  const settings = await tx.restaurantSettings.findUnique({
    where: { id: "singleton" },
    select: { taxPercent: true, serviceChargePercent: true, isAcceptingOrders: true },
  });

  return {
    taxPercent: settings?.taxPercent.toString() ?? "0",
    servicePercent: settings?.serviceChargePercent.toString() ?? "0",
    isAcceptingOrders: settings?.isAcceptingOrders ?? true,
  };
};

/** Computes tax, service charge and total from a subtotal. */
const computeTotals = (
  subtotalMinor: number,
  taxPercent: string,
  servicePercent: string,
  discountMinor = 0
) => {
  const taxMinor = applyPercent(subtotalMinor, taxPercent);
  const serviceMinor = applyPercent(subtotalMinor, servicePercent);
  const totalMinor = subtotalMinor + taxMinor + serviceMinor - discountMinor;

  return {
    subtotal: fromMinorUnits(subtotalMinor),
    // The schema has one tax column; service charge is folded into it and
    // shown as a single line, which is how the receipt reads.
    taxAmount: fromMinorUnits(taxMinor + serviceMinor),
    discountAmount: fromMinorUnits(discountMinor),
    totalAmount: fromMinorUnits(Math.max(0, totalMinor)),
  };
};

/**
 * Reserves the next order number.
 *
 * Delegates to a Postgres sequence: nextval() is atomic, so two simultaneous
 * orders can never receive the same number. Deriving it from COUNT(*) or
 * MAX() in application code races and eventually collides.
 */
const nextOrderNumber = async (tx: TxClient): Promise<string> => {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('order_number_seq')
  `;

  return `ORD-${String(rows[0].nextval).padStart(6, "0")}`;
};

/**
 * Four-character pickup code, e.g. "A92K".
 *
 * Drawn from an alphabet with no O/0 or I/1, because the customer reads it
 * aloud to the waiter and misheard characters would block a legitimate serve.
 * crypto.randomInt, not Math.random: predictable codes could be guessed to
 * intercept another table's food.
 */
const VERIFY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateVerificationCode = (): string =>
  Array.from(
    { length: 4 },
    () => VERIFY_ALPHABET[crypto.randomInt(VERIFY_ALPHABET.length)]
  ).join("");

/**
 * Per-order secret handed to the diner exactly once, in the response to
 * placing the order.
 *
 * Everything a diner alone may see — the tracking page, the pickup code, the
 * payment flow — is keyed on this rather than on orderNumber, which is a
 * sequence and can be walked by anyone.
 */
const generateTrackingToken = (): string =>
  crypto.randomBytes(32).toString("hex");

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Places an order from the customer app.
 *
 * PUBLIC — reached by an anonymous diner who scanned a QR code. Everything
 * that determines the bill is resolved server-side inside one transaction.
 */
export const placeOrder = async (input: PlaceOrderInput) => {
  const order = await prisma.$transaction(async (tx) => {
    const charges = await loadCharges(tx);

    if (!charges.isAcceptingOrders) {
      throw AppError.conflict("The restaurant is not accepting orders right now");
    }

    // Resolve the table from its QR token, never from a client-supplied id.
    let tableId: string | undefined;

    if (input.qrToken) {
      const table = await tx.table.findUnique({
        where: { qrToken: input.qrToken },
        select: { id: true, isActive: true, status: true },
      });

      if (!table || !table.isActive || table.status === "INACTIVE") {
        throw AppError.badRequest("This QR code is not valid");
      }

      tableId = table.id;
    }

    const type = input.type ?? (tableId ? "DINE_IN" : "TAKEAWAY");

    if (type === "DINE_IN" && !tableId) {
      throw AppError.badRequest("A dine-in order requires a scanned table");
    }

    // Upsert the guest by phone so repeat diners accumulate history without
    // ever creating an account.
    let customerId: string | undefined;

    if (input.customer?.phone) {
      const customer = await tx.customer.upsert({
        where: { phone: input.customer.phone },
        update: {
          name: input.customer.name ?? undefined,
          email: input.customer.email ?? undefined,
        },
        create: {
          phone: input.customer.phone,
          name: input.customer.name,
          email: input.customer.email,
        },
      });

      customerId = customer.id;
    } else if (input.customer?.name || input.customer?.email) {
      const customer = await tx.customer.create({
        data: { name: input.customer.name, email: input.customer.email },
      });

      customerId = customer.id;
    }

    const { items, subtotalMinor } = await priceItems(tx, input.items);
    const totals = computeTotals(subtotalMinor, charges.taxPercent, charges.servicePercent);

    const order = await tx.order.create({
      data: {
        orderNumber: await nextOrderNumber(tx),
        trackingToken: generateTrackingToken(),
        verificationCode: generateVerificationCode(),
        type,
        tableId,
        customerId,
        notes: input.notes,
        ...totals,
        // Nested create: items are written in the SAME transaction, so an
        // order can never exist without its lines.
        items: { create: items },
      },
      include: orderInclude,
    });

    if (tableId) {
      await tx.table.update({
        where: { id: tableId },
        data: { status: "OCCUPIED" },
      });
    }

    return order;
  });

  // Emitted AFTER the transaction commits. Emitting inside would announce an
  // order to the kitchen that a later rollback erases.
  emitOrderCreated(order);
  notifyOrderPlaced(order);

  return order;
};

/**
 * Adds items to an order that has already been placed.
 *
 * Permitted only while PENDING or CONFIRMED. Once the kitchen is PREPARING,
 * the contents and the total must stop moving — otherwise a bill changes
 * after the food has started cooking.
 */
export const addItems = async (orderId: string, input: AddItemsInput) => {
  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw AppError.notFound("Order not found");
    }

    if (!EDITABLE_STATUSES.includes(order.status as OrderStatus)) {
      throw AppError.conflict(
        `Cannot add items to an order that is ${order.status.toLowerCase()}`
      );
    }

    const charges = await loadCharges(tx);
    const { items, subtotalMinor: addedMinor } = await priceItems(tx, input.items);

    // Recomputed from the existing lines rather than trusting the stored
    // subtotal, so the total is always derivable from the items themselves.
    const existingMinor = order.items.reduce(
      (sum, item) => sum + toMinorUnits(item.lineTotal.toString()),
      0
    );

    const totals = computeTotals(
      existingMinor + addedMinor,
      charges.taxPercent,
      charges.servicePercent,
      toMinorUnits(order.discountAmount.toString())
    );

    return tx.order.update({
      where: { id: orderId },
      data: { ...totals, items: { create: items } },
      include: orderInclude,
    });
  });

  emitOrderUpdated(updated);

  return updated;
};

/**
 * Performs a status transition in ONE transaction.
 *
 * Everything a transition implies — the guard, the timestamp, the first-actor
 * stamp and releasing the table — happens here, atomically. Splitting it across
 * several statements (as an earlier version did) left windows in which an order
 * was cancelled but its table still read as occupied, and made the cancel path
 * write the same row twice.
 *
 * Emits nothing: the caller decides which event describes what happened, and
 * events must only fire once the transaction has committed.
 *
 * @param actorId staff member making the change, recorded for accountability
 * @param extra   additional columns the specific transition sets, e.g. a
 *                cancellation reason, written in the SAME update
 */
const applyStatusChange = async (
  orderId: string,
  next: OrderStatus,
  actorId?: string,
  // Unchecked, because handledById is set below as a raw column rather than
  // through the relation.
  extra: Prisma.OrderUncheckedUpdateInput = {}
) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, tableId: true, handledById: true },
    });

    if (!order) {
      throw AppError.notFound("Order not found");
    }

    const current = order.status as OrderStatus;

    if (current === next) {
      throw AppError.conflict(`Order is already ${next.toLowerCase()}`);
    }

    if (!canTransition(current, next)) {
      const allowed = ALLOWED_TRANSITIONS[current];

      throw AppError.conflict(
        allowed.length === 0
          ? `Order is ${current.toLowerCase()} and can no longer be changed`
          : `Cannot go from ${current} to ${next}. Allowed: ${allowed.join(", ")}`
      );
    }

    const timestampField = STATUS_TIMESTAMP[next];

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        ...extra,
        status: next,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
        // Recorded on the FIRST staff action only. Overwriting it on every
        // later transition would mean the order was attributed to whoever
        // happened to serve it, erasing who actually accepted it.
        ...(actorId && !order.handledById ? { handledById: actorId } : {}),
      },
      include: orderInclude,
    });

    // Free the table once the order reaches a terminal state and nothing else
    // is open on it. Inside the transaction, so the count cannot be taken
    // against a state the update above has not yet reached.
    if (order.tableId && (next === "SERVED" || next === "CANCELLED")) {
      const openOrders = await tx.order.count({
        where: {
          tableId: order.tableId,
          status: { notIn: ["SERVED", "CANCELLED"] },
        },
      });

      if (openOrders === 0) {
        await tx.table.update({
          where: { id: order.tableId },
          data: { status: "AVAILABLE" },
        });
      }
    }

    return updated;
  });
};

/**
 * Advances an order through the status workflow.
 *
 * @param actorId staff member making the change, recorded for accountability
 */
export const updateStatus = async (
  orderId: string,
  next: OrderStatus,
  actorId?: string
) => {
  const updated = await applyStatusChange(orderId, next, actorId);

  emitOrderStatusChanged(updated);
  notifyOrderStatus(updated);

  return updated;
};

/**
 * Serves an order after verifying the customer's pickup code.
 *
 * The waiter asks the diner for the four-character code and enters it here.
 * The order only moves to SERVED if it matches, which is what stops food
 * being handed to the wrong table. The comparison is case-insensitive because
 * the code is spoken aloud and re-typed.
 *
 * A legacy order placed before this feature has no code; those are allowed
 * through so the change is backward compatible.
 */
export const serveOrder = async (
  orderId: string,
  code: string,
  actorId?: string
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, verificationCode: true },
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  if (order.verificationCode) {
    const supplied = code.trim().toUpperCase();

    if (supplied !== order.verificationCode.toUpperCase()) {
      throw AppError.badRequest(
        "That code does not match this order. Please check with the customer."
      );
    }
  }

  // Reuse the state machine, which enforces that only a READY order can be
  // served and handles table release and the socket broadcast.
  return updateStatus(orderId, "SERVED", actorId);
};

/**
 * Cancels an order with a mandatory reason.
 *
 * The reason is written in the SAME update as the status, so there is never an
 * instant where an order reads as cancelled with no explanation — and only one
 * event is emitted. Announcing both a status change and a cancellation for the
 * same act made every listening screen refetch twice and raised two entries in
 * the notification bell for one cancellation.
 */
export const cancelOrder = async (
  orderId: string,
  reason: string,
  actorId?: string
) => {
  const cancelled = await applyStatusChange(orderId, "CANCELLED", actorId, {
    cancelReason: reason,
  });

  emitOrderCancelled(cancelled);
  notifyOrderStatus(cancelled);

  return cancelled;
};

// Payment settlement deliberately does NOT live here. Order.paymentStatus is
// only a summary of the Payment rows, so writing it without writing the ledger
// leaves the two disagreeing; see settleOrderPayment in payment.service.

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const getOrderById = async (id: string) => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: orderInclude,
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  return order;
};

/**
 * Public order tracking, keyed on the order's tracking token.
 *
 * The token — NOT the order number — is what authorises this read. An order
 * number is a sequence value that anyone can walk, so keying tracking on it
 * would hand every diner's pickup code to whoever counted upwards.
 *
 * Returns only what the diner's screen needs: no staff details and no
 * customer contact information.
 */
export const trackByToken = async (trackingToken: string) => {
  const order = await prisma.order.findUnique({
    where: { trackingToken },
    select: {
      orderNumber: true,
      // Echoed back so the client can keep using it for socket subscription
      // and payment without re-reading it from the URL.
      trackingToken: true,
      // Lets the tracking screen offer online payment while unpaid.
      paymentStatus: true,
      // The pickup code the diner shows the waiter. Safe to return here
      // precisely because reaching this row required the unguessable token.
      verificationCode: true,
      status: true,
      type: true,
      totalAmount: true,
      placedAt: true,
      confirmedAt: true,
      preparedAt: true,
      readyAt: true,
      servedAt: true,
      table: { select: { tableNumber: true } },
      items: {
        select: { foodName: true, quantity: true, lineTotal: true, notes: true },
      },
    },
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  return order;
};

export const listOrders = async (
  query: OrderListQuery
): Promise<{ orders: unknown[]; meta: PaginationMeta }> => {
  const pagination = getPagination(query.page, query.limit);

  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.tableId ? { tableId: query.tableId } : {}),
    ...(query.search
      ? { orderNumber: { contains: query.search, mode: "insensitive" } }
      : {}),
    ...(query.from || query.to
      ? {
          placedAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { placedAt: "desc" },
      include: orderInclude,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, meta: buildPaginationMeta(pagination, total) };
};

/**
 * Live queue for the Kitchen Display System.
 *
 * Unpaginated by design: the KDS shows every open order at once, and the set
 * is naturally bounded by how many orders a kitchen can hold. Sorted oldest
 * first, because that is the order they must be cooked in.
 */
export const getKitchenQueue = async () => {
  const orders = await prisma.order.findMany({
    where: { status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] } },
    orderBy: { placedAt: "asc" },
    include: orderInclude,
  });

  // Attach an estimated cook time to each order so the display can run a live
  // countdown. Prep minutes live on Food, not on the order-item snapshot, so
  // they are fetched once for all items rather than per order.
  const foodIds = [...new Set(orders.flatMap((order) => order.items.map((item) => item.foodId)))];

  const foods = foodIds.length
    ? await prisma.food.findMany({
        where: { id: { in: foodIds } },
        select: { id: true, preparationMinutes: true },
      })
    : [];

  const prepByFood = new Map(foods.map((food) => [food.id, food.preparationMinutes ?? 0]));

  // The order is ready when its slowest dish is ready, so the estimate is the
  // MAX prep time across items, floored at a sensible minimum.
  const withEstimate = orders.map((order) => ({
    ...order,
    estimatedMinutes: Math.max(
      10,
      ...order.items.map((item) => prepByFood.get(item.foodId) ?? 0)
    ),
  }));

  // Grouped into the KDS columns so the client renders without regrouping.
  return {
    pending: withEstimate.filter((order) => order.status === "PENDING"),
    confirmed: withEstimate.filter((order) => order.status === "CONFIRMED"),
    preparing: withEstimate.filter((order) => order.status === "PREPARING"),
    ready: withEstimate.filter((order) => order.status === "READY"),
    total: withEstimate.length,
  };
};
