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

/** POST /api/payments/:id/confirm — PUBLIC (demo checkout). */
export const confirm: RequestHandler<
  IdParams,
  unknown,
  { outcome: "success" | "failure" }
> = async (req, res) => {
  const payment = await paymentService.confirmOnlinePayment(
    req.params.id,
    req.body.outcome
  );

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

/** GET /api/payments — staff payment history (ledger). */
export const list: RequestHandler = async (req, res) => {
  const { payments, meta, totalCollected } = await paymentService.listPayments(
    req.validatedQuery as PaymentListQuery
  );

  // The collected figure describes the FILTERED rows, so it is returned
  // alongside them rather than as a separate, easily-desynchronised call.
  res.json({ success: true, data: payments, meta, summary: { totalCollected } });
};
