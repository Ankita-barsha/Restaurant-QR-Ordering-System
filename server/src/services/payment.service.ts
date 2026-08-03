/**
 * Payment business logic.
 *
 * A payment is recorded as its own row so the history is queryable and a
 * receipt can be reproduced. The order's paymentStatus is the summary; the
 * Payment rows are the ledger.
 *
 * Money moves through the PaymentProvider interface, so this file has no
 * knowledge of any specific gateway.
 */

import crypto from "node:crypto";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { fromMinorUnits, toMinorUnits } from "../utils/money.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import {
  getActivePaymentProvider,
  type ConfirmationPayload,
} from "../utils/paymentProvider.js";
import {
  emitOrderCreated,
  emitOrderUpdated,
  emitPaymentStatusChanged,
} from "../socket/index.js";
import { recordAudit } from "./audit.service.js";
import { recordNotification } from "./notification.service.js";
import { releaseAfterPayment } from "./order.service.js";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** Generates a sequential-feeling but unguessable receipt number. */
const generateReceiptNumber = (): string =>
  `RCPT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

/** Adds up what has actually been captured against an order. */
const collectedMinor = (payments: { amount: { toString(): string } }[]): number =>
  payments.reduce((sum, payment) => sum + toMinorUnits(payment.amount.toString()), 0);

/**
 * Brings the order summary into step with the ledger after money lands.
 *
 * Two jobs that must happen together, inside the settlement transaction:
 *
 *   1. Mark the order PAID only when the FULL amount has been captured. A
 *      deposit is a real payment against a bill that is still outstanding, and
 *      stamping PAID on it would tell the waiter to stop asking for the rest.
 *   2. Release the order to the kitchen if a hold was waiting on this money.
 *
 * The order of the two matters: paymentStatus is written first, so the
 * exposure calculation inside the release sees this order settled and does not
 * hold it a second time against its own paid bill.
 */
const reconcileAfterPayment = async (
  tx: TxClient,
  orderId: string,
  method: "CASH" | "CARD" | "UPI" | "ONLINE"
): Promise<void> => {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      totalAmount: true,
      payments: { where: { status: "SUCCESS" }, select: { amount: true } },
    },
  });

  if (!order) return;

  const billed = toMinorUnits(order.totalAmount.toString());
  const collected = collectedMinor(order.payments);

  await tx.order.update({
    where: { id: orderId },
    data: {
      paymentMethod: method,
      ...(collected >= billed ? { paymentStatus: "PAID" as const } : {}),
    },
  });

  await releaseAfterPayment(tx, orderId);
};

/** Reloads the order in the shape the socket and notifications expect. */
const loadOrderForEmit = async (tx: TxClient, orderId: string) => {
  return tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      // Required for the socket emit to reach the diner's own order room;
      // without it the payment confirmation only lands on staff screens.
      trackingToken: true,
      status: true,
      paymentStatus: true,
      table: { select: { tableNumber: true } },
    },
  });
};

/**
 * Starts an online payment for an order.
 *
 * Public, and authorised by possession of the order's TRACKING TOKEN — the
 * secret handed to the diner when they placed it. Keying this on orderNumber
 * would let anyone open a payment against any order, because order numbers
 * come from a sequence.
 */
export const initiateOnlinePayment = async (trackingToken: string) => {
  const order = await prisma.order.findUnique({
    where: { trackingToken },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      advanceAmount: true,
      paymentStatus: true,
      status: true,
      payments: { where: { status: "SUCCESS" }, select: { amount: true } },
    },
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  if (order.paymentStatus === "PAID") {
    throw AppError.conflict("This order is already paid");
  }

  if (order.status === "CANCELLED") {
    throw AppError.conflict("This order was cancelled");
  }

  /**
   * Nothing is collected before a waiter has looked at the table.
   *
   * The dialog already disables its Pay button in this state, but the rule
   * belongs here: if a guest paid first and the waiter then rejected the
   * order, the restaurant would owe a refund on money it should never have
   * taken. Approval is free to reverse; a payment is not.
   */
  if (order.status === "NEEDS_APPROVAL") {
    throw AppError.conflict(
      "A member of our team is on their way to confirm this order. Payment opens as soon as they have."
    );
  }

  /**
   * What to charge now.
   *
   * An order held for an advance is charged the ADVANCE, not the bill — that
   * is the whole point of taking one. Everything else is charged what is still
   * outstanding, so a guest who part-paid earlier is not asked for the full
   * total a second time.
   */
  const alreadyMinor = collectedMinor(order.payments);
  const isDeposit = order.status === "AWAITING_ADVANCE_PAYMENT";

  const targetMinor = isDeposit
    ? toMinorUnits(order.advanceAmount?.toString() ?? "0")
    : toMinorUnits(order.totalAmount.toString());

  const dueMinor = targetMinor - alreadyMinor;

  if (dueMinor <= 0) {
    throw AppError.conflict("There is nothing left to pay on this order");
  }

  // Resolved per request, not imported once: an administrator entering their
  // Razorpay keys switches the restaurant to real payments immediately.
  const provider = await getActivePaymentProvider();
  const intent = await provider.createIntent(dueMinor, "INR");

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: fromMinorUnits(dueMinor),
      method: "ONLINE",
      status: "PENDING",
      provider: intent.provider,
      providerRef: intent.providerRef,
    },
  });

  return {
    paymentId: payment.id,
    orderNumber: order.orderNumber,
    amount: fromMinorUnits(dueMinor),
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    provider: intent.provider,
    /** Razorpay's order id — the browser checkout will not open without it. */
    providerRef: intent.providerRef,
    /** Publishable key. The key SECRET never leaves the server. */
    publicKey: intent.publicKey ?? null,
    /** True when this is a deposit on a held order rather than the whole bill. */
    isDeposit,
    /** The full bill, so the checkout screen can show what the deposit is of. */
    orderTotal: order.totalAmount.toString(),
    // The client shows an unmistakable demo banner when this is true.
    isDemo: intent.isDemo,
  };
};

/**
 * Confirms an online payment.
 *
 * WHAT AUTHORISES THIS. Against a real gateway, the caller must present the
 * signature Razorpay produced over `order_id|payment_id`, which only Razorpay
 * can compute because it is an HMAC keyed with the merchant's secret. The
 * diner's browser relays that signature; it cannot invent one.
 *
 * The demo gateway accepts a plain "it worked" from the browser instead, and
 * that is the ONLY mode in which it is accepted. Before this was enforced, any
 * diner could POST `{ outcome: "success" }` to this endpoint and walk out with
 * an order marked PAID, having paid nothing — the checkout screen was doing
 * exactly that on their behalf four seconds after they tapped a UPI icon.
 *
 * On success the order is settled in the same transaction as the payment, so
 * the ledger and the order summary can never disagree.
 */
export const confirmOnlinePayment = async (
  paymentId: string,
  confirmation: {
    outcome?: "success" | "failure";
    razorpayPaymentId?: string;
    signature?: string;
  }
) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, orderId: true, status: true, providerRef: true },
  });

  if (!payment) {
    throw AppError.notFound("Payment not found");
  }

  if (payment.status !== "PENDING") {
    throw AppError.conflict("This payment was already completed");
  }

  const provider = await getActivePaymentProvider();

  /**
   * Built here rather than passed straight through.
   *
   * providerRef comes from OUR stored row, never from the request. Taking it
   * from the caller would let someone sign a payload for an order of their
   * own choosing and present it against somebody else's bill.
   */
  const payload: ConfirmationPayload = {
    providerRef: payment.providerRef ?? "",
    razorpayPaymentId: confirmation.razorpayPaymentId,
    signature: confirmation.signature,
    // Only ever consulted by the demo provider. Passing it to the live one is
    // harmless because that implementation ignores the field entirely.
    outcome: confirmation.outcome,
  };

  if (!provider.isDemo && !confirmation.signature) {
    // A clearer refusal than a signature check against nothing. This is the
    // shape of request an old client — or someone poking the API — sends.
    throw AppError.badRequest(
      "This payment must be completed through the gateway checkout."
    );
  }

  const verified = await provider.verifyConfirmation(payload);

  if (!verified) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });

    throw AppError.badRequest("Payment was not completed. Please try again.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESS",
        paidAt: new Date(),
        receiptNumber: generateReceiptNumber(),
        // Swapped from the ORDER id to the PAYMENT id now that one exists.
        // This is the reference that appears in the Razorpay dashboard, on the
        // customer's bank statement and in the Excel export, so it is the one
        // worth keeping when a guest disputes a charge.
        ...(confirmation.razorpayPaymentId
          ? { providerRef: confirmation.razorpayPaymentId }
          : {}),
      },
    });

    await reconcileAfterPayment(tx, payment.orderId, "ONLINE");

    const order = await loadOrderForEmit(tx, payment.orderId);

    return { payment: updated, order };
  });

  // After the commit: refresh staff dashboards and raise a notification.
  if (result.order) {
    emitOrderUpdated(result.order);
    emitPaymentStatusChanged({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      paymentStatus: result.order.paymentStatus,
      method: "ONLINE",
    });

    void recordNotification({
      type: "SYSTEM",
      title: "Online payment received",
      message: `${result.order.orderNumber} paid online`,
      metadata: { orderId: result.order.id, orderNumber: result.order.orderNumber },
    });
  }

  return result.payment;
};

/**
 * Records the ADVANCE taken in cash at the table.
 *
 * The waiter counts the notes, taps "Advance Cash Received", and the order is
 * released to the kitchen in the same transaction. It records a payment for
 * exactly the advance — not the whole bill — so the order stays UNPAID with
 * the remainder outstanding, which is what the guest actually owes.
 *
 * Refuses when the house has switched cash advances off: a restaurant that
 * only wants online advances would otherwise have a one-tap way for any
 * waiter to bypass the gate with no money in the till.
 */
export const recordCashAdvance = async (orderId: string, actorId?: string) => {
  const settings = await prisma.restaurantSettings.findUnique({
    where: { id: "singleton" },
    select: { allowCashAdvance: true },
  });

  if (!settings?.allowCashAdvance) {
    throw AppError.conflict(
      "This restaurant does not accept cash advances. The guest must pay online."
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      advanceAmount: true,
      payments: { where: { status: "SUCCESS" }, select: { amount: true } },
    },
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  if (order.status !== "AWAITING_ADVANCE_PAYMENT") {
    throw AppError.conflict(
      `This order is not waiting for an advance — it is ${order.status
        .toLowerCase()
        .replace(/_/g, " ")}`
    );
  }

  const requiredMinor = toMinorUnits(order.advanceAmount?.toString() ?? "0");
  const dueMinor = requiredMinor - collectedMinor(order.payments);

  // Guards the double-tap: two waiters, or one impatient one, must not book
  // the same advance twice and leave the guest owed a refund.
  if (dueMinor <= 0) {
    throw AppError.conflict("The advance on this order has already been paid");
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        amount: fromMinorUnits(dueMinor),
        method: "CASH",
        status: "SUCCESS",
        provider: "cash",
        paidAt: new Date(),
        receiptNumber: generateReceiptNumber(),
      },
    });

    // Sets the method and releases the hold. Does NOT mark the order paid:
    // the advance is a fraction of the bill and the rest is collected after
    // the meal, exactly as the guest was told.
    await reconcileAfterPayment(tx, order.id, "CASH");

    const full = await loadOrderForEmit(tx, order.id);

    return { payment, order: full };
  });

  if (result.order) {
    emitOrderUpdated(result.order);
    emitPaymentStatusChanged({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      paymentStatus: result.order.paymentStatus,
      method: "CASH",
    });

    // The order has just entered the kitchen queue, so the pass must be told.
    emitOrderCreated(result.order);
  }

  void recordAudit({
    action: "payment.cashAdvance",
    entity: "Payment",
    entityId: result.payment.id,
    actorId,
    after: {
      orderNumber: order.orderNumber,
      advanceCollected: fromMinorUnits(dueMinor),
      receiptNumber: result.payment.receiptNumber,
      releasedTo: result.order?.status ?? null,
    },
  });

  return result.payment;
};

/**
 * Records a cash payment taken at the table.
 *
 * Creates a SUCCESS Payment for the history and marks the order paid. Behind
 * order:updateStatus, the capability staff already hold.
 */
export const recordCashPayment = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, totalAmount: true, paymentStatus: true, status: true },
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  if (order.paymentStatus === "PAID") {
    throw AppError.conflict("This order is already paid");
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        amount: order.totalAmount,
        method: "CASH",
        status: "SUCCESS",
        provider: "cash",
        paidAt: new Date(),
        receiptNumber: generateReceiptNumber(),
      },
    });

    await reconcileAfterPayment(tx, order.id, "CASH");

    const full = await loadOrderForEmit(tx, order.id);

    return { payment, order: full };
  });

  if (result.order) {
    emitOrderUpdated(result.order);
    emitPaymentStatusChanged({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      paymentStatus: result.order.paymentStatus,
      method: "CASH",
    });
  }

  return result.payment;
};

// ---------------------------------------------------------------------------
// Reconciliation: keeping the ledger and the order summary in step
// ---------------------------------------------------------------------------

/**
 * The order shape returned to staff after a settlement, matching what the
 * orders screen already renders.
 */
const orderSummarySelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  totalAmount: true,
  table: { select: { tableNumber: true } },
} satisfies Prisma.OrderSelect;

/**
 * Settles an order's payment from the staff screen.
 *
 * Order.paymentStatus is only ever a SUMMARY of the Payment rows. Writing it on
 * its own — which the orders screen used to do — produced orders marked PAID
 * with nothing in the ledger to show for it, so the payments report and the
 * order list gave different answers about the same money and neither could be
 * reconciled against the till.
 *
 * Every branch here writes both, in one transaction:
 *
 *   PAID      records a Payment if none has succeeded yet
 *   REFUNDED  reverses the successful payments, with a reason
 *   UNPAID    is only permitted while nothing has been collected
 */
export const settleOrderPayment = async (
  orderId: string,
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED",
  paymentMethod?: "CASH" | "CARD" | "UPI" | "ONLINE",
  reason?: string
) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        totalAmount: true,
        paymentStatus: true,
        paymentMethod: true,
        payments: {
          where: { status: "SUCCESS" },
          select: { id: true, method: true, amount: true },
        },
      },
    });

    if (!order) {
      throw AppError.notFound("Order not found");
    }

    const settled = order.payments;

    if (paymentStatus === "PAID") {
      if (settled.length > 0) {
        throw AppError.conflict("This order is already paid");
      }

      // The method matters: it is what the manager reconciles the till
      // against, so it cannot be left to a default.
      if (!paymentMethod) {
        throw AppError.badRequest("Tell us how the customer paid");
      }

      await tx.payment.create({
        data: {
          orderId: order.id,
          amount: order.totalAmount,
          method: paymentMethod,
          status: "SUCCESS",
          // Named for what actually happened: taken by hand at the counter,
          // not processed by any gateway.
          provider: "manual",
          paidAt: new Date(),
          receiptNumber: generateReceiptNumber(),
        },
      });
    } else if (paymentStatus === "REFUNDED") {
      if (settled.length === 0) {
        throw AppError.conflict(
          "There is no successful payment on this order to refund"
        );
      }

      await tx.payment.updateMany({
        where: { orderId: order.id, status: "SUCCESS" },
        data: {
          status: "REFUNDED",
          refundedAt: new Date(),
          refundReason: reason ?? "Refunded by staff",
        },
      });
    } else if (settled.length > 0) {
      // Marking a paid order unpaid would silently orphan a receipt the
      // customer is holding. Refunding is the honest reversal.
      throw AppError.conflict(
        "This order has a recorded payment. Refund it instead of marking it unpaid."
      );
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus,
        // Cleared on the way back to unpaid, so a stale method cannot linger
        // and be reported as cash the till never saw.
        paymentMethod: paymentStatus === "UNPAID" ? null : (paymentMethod ?? undefined),
      },
      select: orderSummarySelect,
    });

    return updated;
  });
};

/**
 * Refunds one payment from the ledger screen.
 *
 * The row is reversed in place rather than offset by a negative one, so
 * "collected" stays a plain SUM over SUCCESS and cannot double-count. The
 * order summary follows: once nothing successful remains, the order is
 * REFUNDED.
 */
export const refundPayment = async (paymentId: string, reason: string) => {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, orderId: true, status: true },
    });

    if (!payment) {
      throw AppError.notFound("Payment not found");
    }

    if (payment.status !== "SUCCESS") {
      throw AppError.conflict(
        `Only a successful payment can be refunded; this one is ${payment.status.toLowerCase()}`
      );
    }

    const refunded = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        refundReason: reason,
      },
    });

    const stillPaid = await tx.payment.count({
      where: { orderId: payment.orderId, status: "SUCCESS" },
    });

    // A partly refunded order (several payments, one reversed) is still paid.
    // Only when nothing successful is left does the summary change.
    if (stillPaid === 0) {
      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: "REFUNDED" },
      });
    }

    const order = await loadOrderForEmit(tx, payment.orderId);

    return { payment: refunded, order };
  });

  if (result.order) {
    emitOrderUpdated(result.order);

    void recordNotification({
      type: "SYSTEM",
      title: "Payment refunded",
      message: `${result.order.orderNumber} refunded — ${reason}`,
      metadata: { orderId: result.order.id, orderNumber: result.order.orderNumber },
    });
  }

  return result.payment;
};

/** Receipt for a single payment. Public: the id is an unguessable cuid. */
export const getReceipt = async (paymentId: string) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      receiptNumber: true,
      amount: true,
      method: true,
      status: true,
      provider: true,
      paidAt: true,
      createdAt: true,
      order: {
        select: {
          orderNumber: true,
          totalAmount: true,
          table: { select: { tableNumber: true } },
          items: {
            select: { foodName: true, quantity: true, lineTotal: true },
          },
        },
      },
    },
  });

  if (!payment) {
    throw AppError.notFound("Receipt not found");
  }

  return payment;
};

/** Payment history — the super admin's ledger view. */
export const listPayments = async (query: {
  page?: number;
  limit?: number;
  status?: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
  method?: "CASH" | "CARD" | "UPI" | "ONLINE";
}): Promise<{ payments: unknown[]; meta: PaginationMeta; totalCollected: string }> => {
  const pagination = getPagination(query.page, query.limit);

  const where: Prisma.PaymentWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.method ? { method: query.method } : {}),
  };

  const [payments, total, collected] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        receiptNumber: true,
        amount: true,
        method: true,
        status: true,
        provider: true,
        paidAt: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      // Narrowed by the SAME filter as the list, so the figure at the top of
      // the screen describes the rows underneath it. Refunded rows are excluded
      // by status: SUCCESS, which is what makes this the money actually held.
      where: { ...where, status: "SUCCESS" },
    }),
  ]);

  const totalCollectedMinor = collected._sum.amount
    ? toMinorUnits(collected._sum.amount.toString())
    : 0;

  return {
    payments,
    meta: buildPaginationMeta(pagination, total),
    totalCollected: fromMinorUnits(totalCollectedMinor),
  };
};

/** Convenience for the reports screen. */
export const totalCollected = async (): Promise<string> => {
  const result = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { status: "SUCCESS" },
  });

  return fromMinorUnits(
    result._sum.amount ? toMinorUnits(result._sum.amount.toString()) : 0
  );
};

/**
 * Handles incoming Razorpay Webhooks (payment.captured, order.paid).
 *
 * Atomically marks the matching order as PAID and emits real-time socket events.
 */
export const handleRazorpayWebhook = async (
  rawBody: string,
  signature: string | undefined
) => {
  /**
   * Authenticate the event BEFORE reading a single field from it.
   *
   * This endpoint is public and unauthenticated — it has to be, Razorpay's
   * servers have no session. The signature is the only thing distinguishing a
   * real "payment captured" from anyone on the internet posting JSON that says
   * so. Until this check existed, a single unauthenticated request marked the
   * most recent pending payment SUCCESS, because the lookup below fell back to
   * `{ status: "PENDING" }` when nothing matched the reference.
   */
  const provider = await getActivePaymentProvider();

  if (!provider.verifyWebhook(rawBody, signature ?? "")) {
    throw AppError.unauthorized("Invalid webhook signature");
  }

  const payload = JSON.parse(rawBody) as {
    event: string;
    payload: {
      payment?: {
        entity?: {
          id: string;
          order_id?: string;
          amount: number;
          currency: string;
          status: string;
          method: string;
        };
      };
    };
  };

  const paymentEntity = payload.payload?.payment?.entity;
  if (!paymentEntity) return { processed: false, reason: "No payment entity in webhook payload" };

  const paymentId = paymentEntity.id;
  const razorpayOrderId = paymentEntity.order_id;

  /**
   * Match on the gateway's own references only.
   *
   * The previous `{ status: "PENDING" }` fallback meant an event that matched
   * NOTHING still settled whichever payment happened to be newest — so a
   * mistimed or malformed event could pay off an unrelated diner's bill.
   * An event we cannot place is reported back, not guessed at.
   */
  const references = [razorpayOrderId, paymentId].filter(
    (reference): reference is string => Boolean(reference)
  );

  const payment = references.length
    ? await prisma.payment.findFirst({
        where: { providerRef: { in: references } },
        orderBy: { createdAt: "desc" },
        select: { id: true, orderId: true, status: true },
      })
    : null;

  if (!payment) {
    return { processed: false, reason: "No payment matches this event" };
  }

  if (payment.status === "SUCCESS") {
    return { processed: true, message: "Payment was already processed" };
  }

  /**
   * Only a CAPTURE settles a bill.
   *
   * Razorpay sends events for the whole lifecycle — authorised, failed,
   * captured, refunded. Treating every one of them as "paid", as this handler
   * previously did, means a `payment.failed` event marks the order settled and
   * the guest walks out on a bill the system believes is cleared.
   */
  if (payload.event === "payment.failed" || paymentEntity.status === "failed") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });

    return { processed: true, message: "Payment failed at the gateway" };
  }

  const captured =
    paymentEntity.status === "captured" ||
    payload.event === "payment.captured" ||
    payload.event === "order.paid";

  if (!captured) {
    // Authorised but not captured is not money in the bank; the capture event
    // follows and is what settles the order.
    return { processed: true, message: `Ignored non-settling event: ${payload.event}` };
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESS",
        paidAt: new Date(),
        providerRef: paymentId,
        receiptNumber: generateReceiptNumber(),
      },
    });

    await reconcileAfterPayment(tx, payment.orderId, "ONLINE");

    const order = await loadOrderForEmit(tx, payment.orderId);
    return { payment: updatedPayment, order };
  });

  if (result.order) {
    emitOrderUpdated(result.order);
    emitPaymentStatusChanged({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      paymentStatus: result.order.paymentStatus,
      method: "ONLINE",
    });
  }

  return { processed: true, orderId: result.order?.id, paymentId: result.payment.id };
};
