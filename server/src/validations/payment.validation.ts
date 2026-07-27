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
 * Demo checkout outcome. A real gateway sends a signed webhook instead; this
 * shape is replaced, not the flow.
 */
export const confirmPaymentSchema = z.object({
  outcome: z.enum(["success", "failure"]),
});

/** Staff records a cash payment taken at the table. */
export const cashPaymentSchema = z.object({
  orderId: z.string().min(1, "orderId is required"),
});

export const paymentListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  method: z.enum(["CASH", "CARD", "UPI", "ONLINE"]).optional(),
});

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
