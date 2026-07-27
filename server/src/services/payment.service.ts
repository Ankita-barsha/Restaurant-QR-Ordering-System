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
import { emitOrderUpdated } from "../socket/index.js";
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
}): Promise<{ payments: unknown[]; meta: PaginationMeta; totalCollectedMinor: number }> => {
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
      where: { status: "SUCCESS" },
    }),
  ]);

  const totalCollectedMinor = collected._sum.amount
    ? toMinorUnits(collected._sum.amount.toString())
    : 0;

  return {
    payments,
    meta: buildPaginationMeta(pagination, total),
    totalCollectedMinor,
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
