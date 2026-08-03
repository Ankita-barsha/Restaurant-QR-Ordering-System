import { z } from "zod";

import { paginationQuerySchema } from "./common.validation.js";

/** Mirrors the OrderStatus enum in schema.prisma. */
export const orderStatusSchema = z.enum([
  "NEEDS_APPROVAL",
  "AWAITING_ADVANCE_PAYMENT",
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
]);

/**
 * The statuses staff may drive an order into by hand.
 *
 * The two held states are absent deliberately. An order enters a hold because
 * a threshold was crossed, and leaves it either by the deposit landing or
 * through the approval endpoint, which records who released it. Allowing
 * "set status to AWAITING_APPROVAL" would let anyone with order:updateStatus
 * bypass the approval trail entirely.
 */
export const settableStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
]);

export const orderTypeSchema = z.enum(["DINE_IN", "TAKEAWAY"]);
export const paymentMethodSchema = z.enum(["CASH", "CARD", "UPI", "ONLINE"]);
export const paymentStatusSchema = z.enum(["UNPAID", "PAID", "REFUNDED"]);

/**
 * A requested line item.
 *
 * NOTE what is absent: price. The client sends only WHAT and HOW MANY. Prices
 * are read from the database server-side, so a tampered request cannot buy a
 * pizza for 0.01.
 */
const orderItemSchema = z.object({
  foodId: z.string().min(1, "foodId is required"),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(99, "Quantity is too large"),
  notes: z.string().trim().max(200).optional(),
});

/**
 * A diner's phone number.
 *
 * Normalised before it is checked, so "+91 98765-43210" and "9876543210" are
 * not stored as two different customers. Customer.phone is unique and is what
 * repeat visits are matched on, so the normalisation is what makes that key
 * mean anything.
 */
const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()\-.]/g, ""))
  .refine((value) => /^\+?\d{10,15}$/.test(value), {
    message: "Enter a valid phone number (at least 10 digits)",
  });

/**
 * Who is ordering.
 *
 * Name and phone are REQUIRED, not a courtesy. Every order is a financial
 * record the restaurant has to be able to account for afterwards — who ordered
 * it, what they were charged, how they paid — and an anonymous row cannot be
 * reconciled, exported or followed up on. It is also how the waiter finds the
 * right guest when the phone rings about a wrong order.
 */
const customerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  phone: phoneSchema,
  email: z.string().email().optional(),
});

/**
 * Placing an order from a scanned QR code.
 *
 * Identified by qrToken rather than tableId: the customer app only ever knows
 * the token from the URL it was opened with, and accepting a raw tableId would
 * let anyone order against any table without scanning anything.
 */
export const placeOrderSchema = z.object({
  qrToken: z.string().min(1).optional(),
  type: orderTypeSchema.optional(),
  customer: customerSchema,
  items: z
    .array(orderItemSchema)
    .min(1, "An order must contain at least one item")
    .max(50, "Too many items in a single order"),
  notes: z.string().trim().max(500).optional(),
});

/** Adding items to an order that is already placed. */
export const addItemsSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Provide at least one item to add"),
});

export const updateStatusSchema = z.object({
  status: settableStatusSchema,
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1, "A cancellation reason is required").max(300),
});

/**
 * Declining a high-value order at the table.
 *
 * The reason is mandatory and a little longer than a free-text minimum would
 * allow: "no" is not an audit entry anybody can act on six weeks later, and
 * this is the record that explains why a guest's order was refused.
 */
export const rejectOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Say why the order is being rejected")
    .max(300),
});

/**
 * Settling an order from the staff screen.
 *
 * The method is required when marking an order PAID — it is what the manager
 * reconciles the till against — and a refund carries the reason the money went
 * back, which the ledger records.
 */
export const updatePaymentSchema = z
  .object({
    paymentStatus: paymentStatusSchema,
    paymentMethod: paymentMethodSchema.optional(),
    reason: z.string().trim().min(1).max(300).optional(),
  })
  .refine(
    (input) => input.paymentStatus !== "PAID" || Boolean(input.paymentMethod),
    { message: "Tell us how the customer paid", path: ["paymentMethod"] }
  );

export const orderListQuerySchema = paginationQuerySchema.extend({
  status: orderStatusSchema.optional(),
  type: orderTypeSchema.optional(),
  tableId: z.string().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  /** ISO dates bounding placedAt, for reports. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * Public order-tracking lookup.
 *
 * Keyed on the tracking token, not the order number. The minimum length
 * rejects an order number pasted into the URL by habit, which would otherwise
 * produce a confusing 404 rather than a clear validation error.
 */
export const trackingTokenParamSchema = z.object({
  token: z.string().min(32, "A valid order tracking link is required"),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type AddItemsInput = z.infer<typeof addItemsSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
