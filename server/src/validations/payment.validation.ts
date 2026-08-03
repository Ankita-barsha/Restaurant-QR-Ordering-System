import { z } from "zod";

import { paginationQuerySchema } from "./common.validation.js";

/**
 * Customer starts an online payment for an order they placed.
 *
 * Identified by the tracking token issued when the order was placed, never by
 * order number — that is a sequence value and would let anyone open a payment
 * against anyone's order.
 */
export const initiatePaymentSchema = z.object({
  trackingToken: z.string().min(32, "A valid order tracking token is required"),
});

/**
 * Completing an online payment.
 *
 * Two shapes share one endpoint, because two gateways can be active:
 *
 *   LIVE — `razorpayPaymentId` + `signature`, exactly as Razorpay's checkout
 *          hands them to the browser. The signature is an HMAC only Razorpay
 *          can produce, which is what makes this safe to accept from a diner's
 *          phone at all.
 *   DEMO — `outcome` alone, an unverified claim from the browser.
 *
 * Both are optional HERE so the endpoint can return a clear message rather
 * than a validation error when a client sends the wrong one. Which shape is
 * actually ACCEPTED is decided by the active provider in the payment service:
 * a live gateway ignores `outcome` entirely, so a diner cannot mark their own
 * bill paid by sending it.
 */
export const confirmPaymentSchema = z
  .object({
    outcome: z.enum(["success", "failure"]).optional(),
    razorpayPaymentId: z.string().trim().min(1).max(120).optional(),
    signature: z.string().trim().min(1).max(256).optional(),
  })
  .refine(
    (input) => Boolean(input.outcome) || Boolean(input.signature),
    { message: "Provide the gateway's payment confirmation" }
  );

/** Staff records a cash payment taken at the table. */
export const cashPaymentSchema = z.object({
  orderId: z.string().min(1, "orderId is required"),
});

/**
 * Reversing a payment. The reason is mandatory: a refund is money leaving the
 * business, and "why" is the first question asked of it afterwards.
 */
export const refundPaymentSchema = z.object({
  reason: z.string().trim().min(1, "A refund reason is required").max(300),
});

export const paymentListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  method: z.enum(["CASH", "CARD", "UPI", "ONLINE"]).optional(),
});

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
