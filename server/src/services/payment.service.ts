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
import { paymentProvider } from "../utils/paymentProvider.js";
import { emitOrderUpdated, emitPaymentStatusChanged } from "../socket/index.js";
import { recordNotification } from "./notification.service.js";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** Generates a sequential-feeling but unguessable receipt number. */
const generateReceiptNumber = (): string =>
  `RCPT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

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
      paymentStatus: true,
      status: true,
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

  const amountMinor = toMinorUnits(order.totalAmount.toString());
  const intent = await paymentProvider.createIntent(amountMinor, "INR");

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: order.totalAmount,
      method: "ONLINE",
      status: "PENDING",
      provider: intent.provider,
      providerRef: intent.providerRef,
    },
  });

  return {
    paymentId: payment.id,
    orderNumber: order.orderNumber,
    amount: order.totalAmount.toString(),
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    provider: intent.provider,
    // The client shows an unmistakable demo banner when this is true.
    isDemo: intent.isDemo,
  };
};

/**
 * Confirms an online payment.
 *
 * DEMO: the outcome is whatever the payer chose on the checkout screen. A real
 * gateway replaces this with signature verification of a webhook — the same
 * method on the provider, so this function does not change.
 *
 * On success the order is marked paid in the same transaction as the payment,
 * so the ledger and the summary can never disagree.
 */
export const confirmOnlinePayment = async (
  paymentId: string,
  outcome: "success" | "failure"
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

  const verified = await paymentProvider.verifyConfirmation({
    providerRef: payment.providerRef ?? "",
    outcome,
  });

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
      },
    });

    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: "PAID", paymentMethod: "ONLINE" },
    });

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

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "PAID", paymentMethod: "CASH" },
    });

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
