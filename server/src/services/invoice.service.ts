/**
 * Invoice generation.
 *
 * An invoice is a STATEMENT OF WHAT WAS CHARGED, so every figure on it is read
 * back from the order and its line items — never recomputed from the live menu
 * or the current tax rate. Order items snapshot their name and price at
 * purchase time precisely so this is possible: a dish renamed or repriced next
 * week must not rewrite an invoice issued today.
 *
 * The restaurant's identity (name, logo, address) is read live from settings,
 * because that is presentation rather than an amount charged: a restaurant
 * that moves premises wants its new address on a reprint.
 */

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { fromMinorUnits, toMinorUnits } from "../utils/money.js";
import { getSettings } from "./settings.service.js";

/** Everything an invoice needs from the order, in one query. */
const invoiceInclude = {
  items: {
    select: {
      id: true,
      foodName: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
      notes: true,
    },
  },
  table: { select: { tableNumber: true } },
  customer: { select: { name: true, phone: true } },
  payments: {
    where: { status: "SUCCESS" as const },
    orderBy: { paidAt: "desc" as const },
    take: 1,
    select: { receiptNumber: true, method: true, paidAt: true },
  },
} satisfies Prisma.OrderInclude;

type InvoiceOrder = Prisma.OrderGetPayload<{ include: typeof invoiceInclude }>;

/**
 * The invoice number.
 *
 * Derived from the order number rather than drawn from a second sequence:
 * one order is one bill, so a separate counter would only create a second
 * identifier for the same thing — and a gap in it the first time an invoice
 * was generated twice. `ORD-000045` becomes `INV-000045`, which also means
 * staff can move between the two by reading, not by looking anything up.
 */
export const invoiceNumberFor = (orderNumber: string): string =>
  orderNumber.replace(/^ORD-/, "INV-");

/**
 * Assembles the invoice document.
 *
 * Totals are taken from the order's own stored columns. They are re-derived
 * from the lines ONLY to state the subtotal, which is what the persisted
 * subtotal already holds — the arithmetic below exists to compute the balance
 * due, in integer paise, because a float would drift by a paisa on a long bill.
 */
const buildInvoice = async (order: InvoiceOrder) => {
  const settings = await getSettings();

  const paidMinor =
    order.paymentStatus === "PAID"
      ? toMinorUnits(order.totalAmount.toString())
      : 0;

  const totalMinor = toMinorUnits(order.totalAmount.toString());
  const payment = order.payments.at(0);

  return {
    invoiceNumber: invoiceNumberFor(order.orderNumber),
    orderNumber: order.orderNumber,
    /** When the order was placed — the date the goods were supplied. */
    issuedAt: order.placedAt.toISOString(),

    restaurant: {
      name: settings.name,
      logoUrl: settings.logoUrl,
      // Assembled the same way the public settings endpoint does it, so the
      // address reads identically wherever it appears.
      address: [
        settings.addressLine,
        settings.city,
        settings.state,
        settings.postalCode,
        settings.country,
      ]
        .filter(Boolean)
        .join(", "),
      phone: settings.phone,
      email: settings.email,
      currency: settings.currency,
    },

    table: order.table?.tableNumber ?? null,
    orderType: order.type,
    customer: order.customer
      ? { name: order.customer.name, phone: order.customer.phone }
      : null,

    items: order.items.map((item) => ({
      id: item.id,
      name: item.foodName,
      unitPrice: item.unitPrice.toString(),
      quantity: item.quantity,
      lineTotal: item.lineTotal.toString(),
      notes: item.notes,
    })),

    /**
     * Charged amounts, exactly as invoiced.
     *
     * `tax` is tax and service charge combined, which is how the order stored
     * it and how the receipt has always read — splitting them here would show
     * the customer a breakdown the stored row cannot substantiate.
     */
    totals: {
      subtotal: order.subtotal.toString(),
      tax: order.taxAmount.toString(),
      discount: order.discountAmount.toString(),
      grandTotal: order.totalAmount.toString(),
      amountPaid: fromMinorUnits(paidMinor),
      balanceDue: fromMinorUnits(Math.max(0, totalMinor - paidMinor)),
    },

    payment: {
      status: order.paymentStatus,
      method: order.paymentMethod ?? payment?.method ?? null,
      receiptNumber: payment?.receiptNumber ?? null,
      paidAt: payment?.paidAt?.toISOString() ?? null,
    },

    status: order.status,
    /** Stated so a reader knows a voided bill is not a demand for money. */
    isCancelled: order.status === "CANCELLED",
  };
};

/** Staff path: the invoice for an order they can already see. */
export const getInvoiceByOrderId = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: invoiceInclude,
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  return buildInvoice(order);
};

/**
 * Diner path: the invoice for the order whose tracking token they hold.
 *
 * Keyed on the token for the same reason the tracking page is — an order
 * number comes from a sequence, so keying a bill on it would let anyone count
 * upwards and read other people's.
 */
export const getInvoiceByTrackingToken = async (trackingToken: string) => {
  const order = await prisma.order.findUnique({
    where: { trackingToken },
    include: invoiceInclude,
  });

  if (!order) {
    throw AppError.notFound("Order not found");
  }

  return buildInvoice(order);
};
