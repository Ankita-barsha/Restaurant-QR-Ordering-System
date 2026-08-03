import type { RequestHandler } from "express";

import * as paymentService from "../services/payment.service.js";
import type { PaymentListQuery } from "../validations/payment.validation.js";

type IdParams = { id: string };

/** POST /api/payments/online — PUBLIC. The diner starts an online payment. */
export const initiate: RequestHandler<
  Record<string, never>,
  unknown,
  { trackingToken: string }
> = async (req, res) => {
  const intent = await paymentService.initiateOnlinePayment(req.body.trackingToken);

  res.status(201).json({ success: true, data: intent });
};

/**
 * POST /api/payments/:id/confirm — PUBLIC.
 *
 * Against a live gateway the body must carry the signature Razorpay's checkout
 * returned; `outcome` alone is only honoured by the demo gateway. The service
 * enforces that — this handler just relays what the browser was given.
 */
export const confirm: RequestHandler<
  IdParams,
  unknown,
  {
    outcome?: "success" | "failure";
    razorpayPaymentId?: string;
    signature?: string;
  }
> = async (req, res) => {
  const payment = await paymentService.confirmOnlinePayment(req.params.id, {
    outcome: req.body.outcome,
    razorpayPaymentId: req.body.razorpayPaymentId,
    signature: req.body.signature,
  });

  res.json({
    success: true,
    message: "Payment successful",
    data: { paymentId: payment.id, receiptNumber: payment.receiptNumber },
  });
};

/** GET /api/payments/:id/receipt — PUBLIC (id is unguessable). */
export const receipt: RequestHandler<IdParams> = async (req, res) => {
  const data = await paymentService.getReceipt(req.params.id);

  res.json({ success: true, data });
};

/**
 * POST /api/payments/cash-advance — the waiter took the advance in cash.
 *
 * Records exactly the outstanding advance and releases the order to the
 * kitchen. Distinct from /cash, which settles a whole bill: an advance leaves
 * the order UNPAID with a remainder still to collect.
 */
export const recordCashAdvance: RequestHandler<
  Record<string, never>,
  unknown,
  { orderId: string }
> = async (req, res) => {
  const payment = await paymentService.recordCashAdvance(
    req.body.orderId,
    req.user?.sub
  );

  res.json({
    success: true,
    message: "Advance received — the order is on its way to the kitchen",
    data: { paymentId: payment.id, receiptNumber: payment.receiptNumber },
  });
};

/** POST /api/payments/cash — staff records a cash payment. */
export const recordCash: RequestHandler<
  Record<string, never>,
  unknown,
  { orderId: string }
> = async (req, res) => {
  const payment = await paymentService.recordCashPayment(req.body.orderId);

  res.json({
    success: true,
    message: "Cash payment recorded",
    data: { paymentId: payment.id, receiptNumber: payment.receiptNumber },
  });
};

/** POST /api/payments/:id/refund — a manager reverses a payment. */
export const refund: RequestHandler<IdParams, unknown, { reason: string }> = async (
  req,
  res
) => {
  const payment = await paymentService.refundPayment(
    req.params.id,
    req.body.reason
  );

  res.json({
    success: true,
    message: "Payment refunded",
    data: { paymentId: payment.id, status: payment.status },
  });
};

/**
 * POST /api/payments/razorpay-webhook — PUBLIC, called by Razorpay itself.
 *
 * The route mounts express.raw() so req.body here is a Buffer of the EXACT
 * bytes Razorpay sent. That matters: the signature covers those bytes, and a
 * parsed-then-re-serialised body reorders keys and drops whitespace, so it
 * would never verify.
 */
export const razorpayWebhook: RequestHandler = async (req, res) => {
  const signature = req.get("x-razorpay-signature");
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : JSON.stringify(req.body ?? {});

  try {
    const result = await paymentService.handleRazorpayWebhook(rawBody, signature);

    res.json({ success: true, ...result });
  } catch (error) {
    // Razorpay retries on a 5xx and gives up on a 4xx. A bad signature is
    // permanent, so 401 stops it retrying something that will never succeed.
    const status = (error as { statusCode?: number })?.statusCode ?? 400;

    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Webhook processing failed",
    });
  }
};

/** GET /api/payments — staff payment history (ledger). */
export const list: RequestHandler = async (req, res) => {
  const { payments, meta, totalCollected } = await paymentService.listPayments(
    req.validatedQuery as PaymentListQuery
  );

  // The collected figure describes the FILTERED rows, so it is returned
  // alongside them rather than as a separate, easily-desynchronised call.
  res.json({ success: true, data: payments, meta, summary: { totalCollected } });
};
