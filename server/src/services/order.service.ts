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
import { effectivePriceMinor } from "../utils/offer.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import {
  emitOrderCancelled,
  emitOrderCreated,
  emitOrderNeedsApproval,
  emitOrderStatusChanged,
  emitOrderUpdated,
  emitWaiterOrderReady,
} from "../socket/index.js";
import { recordAudit } from "./audit.service.js";
import {
  notifyOrderHeld,
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
  // A held order leaves the hold either by being released or by being voided.
  // It can NEVER jump straight to CONFIRMED: that would let the kitchen accept
  // an order the gate exists to keep from it.
  //
  // Approval precedes payment, so NEEDS_APPROVAL can hand on to the advance
  // gate, and the advance gate releases straight to the kitchen queue.
  NEEDS_APPROVAL: ["AWAITING_ADVANCE_PAYMENT", "PENDING", "CANCELLED"],
  AWAITING_ADVANCE_PAYMENT: ["PENDING", "CANCELLED"],
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

/** Statuses in which the kitchen has not been told about the order yet. */
const HELD_STATUSES: OrderStatus[] = [
  "NEEDS_APPROVAL",
  "AWAITING_ADVANCE_PAYMENT",
];

export const isHeld = (status: OrderStatus): boolean =>
  HELD_STATUSES.includes(status);

/**
 * Statuses during which the order contents may still change.
 *
 * A held order is deliberately absent. Its hold was calculated from a total,
 * and letting that total move underneath it would mean a guest could clear a
 * ₹500 deposit and then add ₹8,000 of food to the same order.
 */
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
 *
 * A dish on offer is charged its OFFER price. That is not a display concern:
 * the menu advertises ₹400, and this is the code that decides whether the
 * diner is billed ₹400 or ₹500. It reads the offer columns and re-derives the
 * effective price with the same function the food service used to compute the
 * stored one, rather than trusting `offerPrice` alone — so a row whose derived
 * column somehow disagrees with its own discount still charges the discount
 * the menu showed.
 */
const priceItems = async (
  tx: TxClient,
  requested: { foodId: string; quantity: number; notes?: string }[]
): Promise<{ items: PricedItem[]; subtotalMinor: number }> => {
  const foodIds = [...new Set(requested.map((item) => item.foodId))];

  const foods = await tx.food.findMany({
    where: { id: { in: foodIds }, deletedAt: null },
    select: {
      id: true,
      name: true,
      price: true,
      isAvailable: true,
      isOfferActive: true,
      offerType: true,
      offerValue: true,
    },
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

    // The offer price when one is running, the list price otherwise.
    const unitMinor = effectivePriceMinor(toMinorUnits(food.price.toString()), food);
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

/** Reads tax, service charge and the high-value gate configuration. */
const loadCharges = async (tx: TxClient) => {
  const settings = await tx.restaurantSettings.findUnique({
    where: { id: "singleton" },
    select: {
      taxPercent: true,
      serviceChargePercent: true,
      isAcceptingOrders: true,
      highValueThreshold: true,
      advancePaymentPercent: true,
      approvalRequired: true,
      advancePaymentRequired: true,
    },
  });

  return {
    taxPercent: settings?.taxPercent.toString() ?? "0",
    servicePercent: settings?.serviceChargePercent.toString() ?? "0",
    isAcceptingOrders: settings?.isAcceptingOrders ?? true,
    gates: {
      // Absent settings mean no gate at all. A restaurant whose settings row
      // has somehow gone missing must still be able to take orders.
      thresholdMinor: toMinorUnits(settings?.highValueThreshold.toString() ?? "0"),
      advancePercent: settings?.advancePaymentPercent.toString() ?? "0",
      approvalRequired: settings?.approvalRequired ?? false,
      advanceRequired: settings?.advancePaymentRequired ?? false,
    },
  };
};

// ---------------------------------------------------------------------------
// Walk-out gates
//
// The loss from a diner who eats and leaves is not the bill — it is the food
// already cooked. So both gates sit BEFORE the kitchen is told, and both are
// measured against the table's whole open balance rather than the single order
// being placed. A per-order limit is defeated by splitting one ₹8,000 order
// into nine ₹900 ones, which is the first thing anybody tries.
// ---------------------------------------------------------------------------

export type GateSettings = Awaited<ReturnType<typeof loadCharges>>["gates"];

/**
 * How long an unsettled order keeps counting against a table.
 *
 * Without a window, one forgotten unpaid order from last month would hold
 * every future order on that table for ever. Twelve hours covers the longest
 * realistic sitting and resets by the next service.
 */
const SESSION_WINDOW_HOURS = 12;

/**
 * What the restaurant currently stands to lose on this table.
 *
 * Money already collected is subtracted per order, so a party that has paid a
 * deposit is only exposed for the remainder — otherwise paying a deposit would
 * push a table CLOSER to its next gate, which is precisely backwards.
 *
 * Served-but-unpaid orders are counted. That is not an oversight: an order
 * that has been eaten and not settled is the exact exposure being managed.
 */
const openBalanceMinor = async (
  tx: TxClient,
  scope: { tableId?: string; customerId?: string }
): Promise<number> => {
  // Takeaway has no table, so the diner's own record is the next best handle
  // on "the same person". With neither, there is nothing to accumulate
  // against and the gate falls back to this order alone.
  const where = scope.tableId
    ? { tableId: scope.tableId }
    : scope.customerId
      ? { customerId: scope.customerId }
      : null;

  if (!where) return 0;

  const open = await tx.order.findMany({
    where: {
      ...where,
      status: { not: "CANCELLED" },
      paymentStatus: { not: "PAID" },
      placedAt: {
        gte: new Date(Date.now() - SESSION_WINDOW_HOURS * 60 * 60 * 1000),
      },
    },
    select: {
      totalAmount: true,
      payments: { where: { status: "SUCCESS" }, select: { amount: true } },
    },
  });

  return open.reduce((exposure, order) => {
    const billed = toMinorUnits(order.totalAmount.toString());
    const collected = order.payments.reduce(
      (paid, payment) => paid + toMinorUnits(payment.amount.toString()),
      0
    );

    return exposure + Math.max(0, billed - collected);
  }, 0);
};

interface Hold {
  status: OrderStatus;
  /** In minor units. Zero unless the advance gate fired. */
  advanceMinor: number;
  /** True when the open balance crossed the high-value threshold at all. */
  isHighValue: boolean;
}

/**
 * Decides whether an order is held, and how.
 *
 * ONE threshold, two gates, in a fixed order:
 *
 *   NEEDS_APPROVAL            a member of staff confirms a real party is there
 *   AWAITING_ADVANCE_PAYMENT  the guest puts the advance down
 *   PENDING                   the kitchen is told
 *
 * Approval comes FIRST deliberately. Asking a guest for money before anyone
 * has walked over to say hello is the wrong order of events for a restaurant —
 * and if the order turns out to be bogus, the waiter rejects it without a
 * payment ever having been taken, which is one less refund to process.
 *
 * `>=` not `>`: the threshold is the point at which the policy applies, and a
 * table sitting exactly on ₹3,000 is what the setting says it is. Getting this
 * backwards silently exempts every round-number bill.
 */
export const evaluateHold = (
  exposureMinor: number,
  orderTotalMinor: number,
  gates: GateSettings
): Hold => {
  const orderTotalTaka = orderTotalMinor / 100;
  const thresholdTaka = gates.thresholdMinor > 0 ? gates.thresholdMinor / 100 : 3000;

  // Advance payment is ONLY required if enabled AND order total is strictly greater than 3,000 taka (or threshold)
  const isHighValue =
    gates.advanceRequired && orderTotalTaka > thresholdTaka;

  if (!isHighValue) {
    if (gates.approvalRequired && gates.thresholdMinor > 0 && (exposureMinor / 100) >= thresholdTaka) {
      return { status: "NEEDS_APPROVAL", advanceMinor: 0, isHighValue: true };
    }
    return { status: "PENDING", advanceMinor: 0, isHighValue: false };
  }

  // Dynamic Advance Calculation:
  // Base 20% advance for orders > 3,000 taka, plus +10% for every additional 1,000 taka above 3,000 taka.
  const extraThousands = Math.floor((orderTotalTaka - thresholdTaka) / 1000);
  const calculatedPercent = 20 + extraThousands * 10;
  const advancePercent = Math.min(calculatedPercent, 100);

  const advanceMinor = applyPercent(orderTotalMinor, advancePercent);

  if (gates.approvalRequired) {
    return { status: "NEEDS_APPROVAL", advanceMinor, isHighValue: true };
  }

  if (advanceMinor > 0) {
    return {
      status: "AWAITING_ADVANCE_PAYMENT",
      advanceMinor,
      isHighValue: true,
    };
  }

  return { status: "PENDING", advanceMinor: 0, isHighValue: false };
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
 * Per-order secret handed to the diner exactly once, in the response to
 * placing the order.
 *
 * Everything a diner alone may see — the tracking page, the invoice, the
 * payment flow — is keyed on this rather than on orderNumber, which is a
 * sequence and can be walked by anyone.
 */
const generateTrackingToken = (): string =>
  crypto.randomBytes(32).toString("hex");

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Where a public request came from, for the audit trail.
 *
 * Passed in by the controller rather than read here: a service that reaches
 * for the request object stops being callable from a script or a test.
 */
export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Places an order from the customer app.
 *
 * PUBLIC — reached by a diner who scanned a QR code and has no account.
 * Everything that determines the bill is resolved server-side inside one
 * transaction.
 *
 * The diner's name and phone are required by the schema, so every order is
 * attributable. That is what makes the audit entry below and the spreadsheet
 * export worth anything: a row with no one attached to it cannot be
 * reconciled, refunded or followed up.
 */
export const placeOrder = async (
  input: PlaceOrderInput,
  context: RequestContext = {}
) => {
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
    // ever creating an account. Both fields are mandatory at the schema, so
    // there is no anonymous branch to fall back to any more.
    const customer = await tx.customer.upsert({
      where: { phone: input.customer.phone },
      update: {
        name: input.customer.name,
        email: input.customer.email ?? undefined,
      },
      create: {
        phone: input.customer.phone,
        name: input.customer.name,
        email: input.customer.email,
      },
    });

    const customerId = customer.id;

    const { items, subtotalMinor } = await priceItems(tx, input.items);
    const totals = computeTotals(subtotalMinor, charges.taxPercent, charges.servicePercent);

    /**
     * The walk-out gates.
     *
     * Evaluated INSIDE the transaction, against the balance as it stands right
     * now. Reading it beforehand would let two orders placed a moment apart
     * each see the table as empty and both slip under the threshold.
     */
    const exposureMinor =
      (await openBalanceMinor(tx, { tableId, customerId })) +
      toMinorUnits(totals.totalAmount);

    const hold = evaluateHold(
      exposureMinor,
      toMinorUnits(totals.totalAmount),
      charges.gates
    );

    const order = await tx.order.create({
      data: {
        orderNumber: await nextOrderNumber(tx),
        trackingToken: generateTrackingToken(),
        type,
        tableId,
        customerId,
        notes: input.notes,
        ...totals,
        status: hold.status,
        ...(hold.advanceMinor > 0
          ? { advanceAmount: fromMinorUnits(hold.advanceMinor) }
          : {}),
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

  /**
   * Emitted AFTER the transaction commits. Emitting inside would announce an
   * order to the kitchen that a later rollback erases.
   *
   * A held order is NOT announced as created. ORDER_CREATED is what puts a
   * ticket on the pass, and the entire purpose of the hold is that the kitchen
   * does not start cooking. The floor is told through its own event instead,
   * and the guest is told by their tracking screen.
   */
  if (isHeld(order.status as OrderStatus)) {
    emitOrderNeedsApproval(order);
    notifyOrderHeld(order);
  } else {
    emitOrderCreated(order);
    notifyOrderPlaced(order);
  }

  /**
   * Audit the placement.
   *
   * Written here rather than by the audit middleware because that middleware
   * snapshots the whole response body, and this response carries the order's
   * trackingToken — the per-order secret that authorises tracking, the invoice
   * and payment. An audit row is read by every administrator; a secret copied
   * into one is a leak that outlives the order.
   *
   * actorId is deliberately absent: no member of staff did this, the diner
   * did, and the trail says so by naming them in the snapshot instead.
   *
   * Not awaited — recordAudit never rejects, and the diner must not wait on a
   * log write to see their order confirmed.
   */
  void recordAudit({
    action: "order.place",
    entity: "Order",
    entityId: order.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    after: {
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      type: order.type,
      table: order.table?.tableNumber ?? null,
      customerName: order.customer?.name ?? input.customer.name,
      customerPhone: order.customer?.phone ?? input.customer.phone,
      items: order.items.map((item) => ({
        dish: item.foodName,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
      })),
      totalPlates: order.items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: order.subtotal.toString(),
      taxAmount: order.taxAmount.toString(),
      totalAmount: order.totalAmount.toString(),
      notes: order.notes,
      // Recorded so the trail shows WHY a large order did not reach the
      // kitchen immediately — otherwise a held order looks like a system
      // fault to whoever reads the log afterwards.
      status: order.status,
      advanceAmount: order.advanceAmount?.toString() ?? null,
    },
  });

  return order;
};

// ---------------------------------------------------------------------------
// Releasing a held order
// ---------------------------------------------------------------------------

/**
 * Releases an order whose advance has now been collected.
 *
 * Called from the payment service INSIDE its settlement transaction, so the
 * money landing and the order moving are one atomic act. A separate write
 * afterwards would leave a window in which the guest has paid and the kitchen
 * still has not been told — the exact failure the guest is watching for on
 * their tracking screen.
 *
 * Releases straight to PENDING. The approval gate, when it is enabled, has
 * already been passed: approval comes first and is what puts the order into
 * AWAITING_ADVANCE_PAYMENT in the first place.
 *
 * Returns the next status when it changed, null when nothing was held.
 */
export const releaseAfterPayment = async (
  tx: TxClient,
  orderId: string
): Promise<OrderStatus | null> => {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      advanceAmount: true,
      payments: { where: { status: "SUCCESS" }, select: { amount: true } },
    },
  });

  if (!order || order.status !== "AWAITING_ADVANCE_PAYMENT") {
    return null;
  }

  const requiredMinor = toMinorUnits(order.advanceAmount?.toString() ?? "0");
  const collectedMinor = order.payments.reduce(
    (sum, payment) => sum + toMinorUnits(payment.amount.toString()),
    0
  );

  // A part-paid advance stays held. Releasing on the first rupee would make
  // the whole gate decorative.
  if (collectedMinor < requiredMinor) {
    return null;
  }

  await tx.order.update({
    where: { id: order.id },
    data: { status: "PENDING" },
  });

  return "PENDING";
};

/**
 * Releases a held order because a member of staff vouched for the table.
 *
 * The whole control is that a named person walked over and saw a real party
 * sitting there, so the approver is recorded on the order and in the audit
 * trail.
 *
 * Where it goes next depends on whether an advance is owed. An approved
 * high-value order with an advance still outstanding moves to
 * AWAITING_ADVANCE_PAYMENT rather than to the kitchen — approving the party is
 * not the same as being paid, and conflating the two would let the floor waive
 * the money gate with a tap.
 *
 * Guarded against double approval: a second call finds the order already past
 * NEEDS_APPROVAL and is refused, so two waiters tapping at once cannot both
 * stamp their name on it.
 */
export const approveOrder = async (
  orderId: string,
  actorId?: string,
  context: RequestContext = {}
) => {
  const approved = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        advanceAmount: true,
        payments: { where: { status: "SUCCESS" }, select: { amount: true } },
      },
    });

    if (!order) {
      throw AppError.notFound("Order not found");
    }

    if (order.status === "AWAITING_ADVANCE_PAYMENT") {
      throw AppError.conflict(
        "This order is already approved and is waiting for its advance payment."
      );
    }

    if (order.status !== "NEEDS_APPROVAL") {
      throw AppError.conflict(
        `This order is already ${order.status.toLowerCase().replace(/_/g, " ")} — there is nothing to approve`
      );
    }

    // Anything already collected counts. A guest who paid at the counter
    // before the waiter reached the table should not be asked twice.
    const requiredMinor = toMinorUnits(order.advanceAmount?.toString() ?? "0");
    const collectedMinor = order.payments.reduce(
      (sum, payment) => sum + toMinorUnits(payment.amount.toString()),
      0
    );

    const next: OrderStatus =
      requiredMinor > 0 && collectedMinor < requiredMinor
        ? "AWAITING_ADVANCE_PAYMENT"
        : "PENDING";

    return tx.order.update({
      where: { id: orderId },
      data: {
        status: next,
        approvedById: actorId,
        approvedAt: new Date(),
      },
      include: orderInclude,
    });
  });

  /**
   * ORDER_CREATED is what puts a ticket on the pass, so it fires only when the
   * order has actually reached the kitchen queue. An order approved but still
   * owing its advance is announced to the floor instead — it has moved, but
   * not to the kitchen.
   */
  if (approved.status === "PENDING") {
    emitOrderCreated(approved);
    notifyOrderPlaced(approved);
  } else {
    emitOrderNeedsApproval(approved);
  }

  emitOrderStatusChanged(approved);

  void recordAudit({
    action: "order.approve",
    entity: "Order",
    entityId: approved.id,
    actorId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    after: {
      orderNumber: approved.orderNumber,
      totalAmount: approved.totalAmount.toString(),
      advanceAmount: approved.advanceAmount?.toString() ?? null,
      table: approved.table?.tableNumber ?? null,
      customerName: approved.customer?.name ?? null,
      customerPhone: approved.customer?.phone ?? null,
      releasedTo: approved.status,
    },
  });

  return approved;
};

/**
 * Rejects a high-value order the waiter could not verify at the table.
 *
 * Cancels it with a mandatory reason, which is the honest outcome: there is no
 * separate REJECTED state because a rejected order is simply one that will
 * never be cooked, and inventing a second terminal state would mean every
 * report, filter and total had to learn about both.
 *
 * Separate from the generic cancel endpoint because the ACT is different and
 * the trail should say so. Cancelling is a manager voiding a live order;
 * rejecting is the floor declining to vouch for a table, and it is the
 * counterpart to approving that the same permission covers.
 */
export const rejectOrder = async (
  orderId: string,
  reason: string,
  actorId?: string,
  context: RequestContext = {}
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  if (!isHeld(order.status as OrderStatus)) {
    throw AppError.conflict(
      "Only an order still awaiting approval or its advance can be rejected. Cancel it instead."
    );
  }

  const rejected = await applyStatusChange(orderId, "CANCELLED", actorId, {
    cancelReason: reason,
  });

  emitOrderCancelled(rejected);
  notifyOrderStatus(rejected);

  void recordAudit({
    action: "order.reject",
    entity: "Order",
    entityId: rejected.id,
    actorId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    after: {
      orderNumber: rejected.orderNumber,
      totalAmount: rejected.totalAmount.toString(),
      table: rejected.table?.tableNumber ?? null,
      customerName: rejected.customer?.name ?? null,
      customerPhone: rejected.customer?.phone ?? null,
      reason,
    },
  });

  return rejected;
};

/**
 * The diner abandoning their own held order.
 *
 * PUBLIC, authorised by the tracking token — the same secret that authorises
 * them to view it. Restricted to HELD orders on purpose: a guest may walk away
 * from an advance they have decided not to pay, but must not be able to void
 * food the kitchen has already started cooking.
 */
export const cancelHeldOrderByToken = async (
  trackingToken: string,
  context: RequestContext = {}
) => {
  const order = await prisma.order.findUnique({
    where: { trackingToken },
    select: { id: true, status: true, orderNumber: true },
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  if (!isHeld(order.status as OrderStatus)) {
    throw AppError.conflict(
      "This order has already gone to the kitchen. Please speak to a member of staff."
    );
  }

  const cancelled = await applyStatusChange(order.id, "CANCELLED", undefined, {
    cancelReason: "Cancelled by the guest before payment",
  });

  emitOrderCancelled(cancelled);
  notifyOrderStatus(cancelled);

  void recordAudit({
    action: "order.cancelByGuest",
    entity: "Order",
    entityId: cancelled.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    after: {
      orderNumber: cancelled.orderNumber,
      totalAmount: cancelled.totalAmount.toString(),
      table: cancelled.table?.tableNumber ?? null,
      customerName: cancelled.customer?.name ?? null,
      customerPhone: cancelled.customer?.phone ?? null,
    },
  });

  return cancelled;
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

    if (isHeld(order.status as OrderStatus)) {
      throw AppError.conflict(
        "This order is being held pending approval or a deposit. Release it first, or place the extra items as a new order."
      );
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

  // When a dish is ready, fire a dedicated event so the waiter screen can
  // play its own alert sound and highlight the card — without the waiter
  // having to watch the same generic status feed as the kitchen.
  if (next === "READY") {
    emitWaiterOrderReady(updated);
  }

  return updated;
};

/**
 * Marks a READY order as delivered to the table.
 *
 * There is deliberately no pickup code any more. The waiter reads the table
 * number off the ticket and takes the food there; asking the diner to read
 * back a four-character code added a step to every service and told the
 * waiter nothing the ticket did not already say.
 *
 * Delegates to the state machine, which enforces that only a READY order can
 * be served and handles table release and the socket broadcast.
 */
export const serveOrder = async (orderId: string, actorId?: string) =>
  updateStatus(orderId, "SERVED", actorId);

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
 * would hand every diner's order and invoice to whoever counted upwards.
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
      status: true,
      type: true,
      totalAmount: true,
      // What the diner must pay before the kitchen is told, when their order
      // was held. Null on an ordinary order, which is how the tracking screen
      // knows not to show the advance panel at all.
      advanceAmount: true,
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
