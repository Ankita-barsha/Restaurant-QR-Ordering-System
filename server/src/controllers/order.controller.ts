import type { RequestHandler } from "express";

import * as invoiceService from "../services/invoice.service.js";
import * as orderService from "../services/order.service.js";
import * as paymentService from "../services/payment.service.js";
import type {
  AddItemsInput,
  OrderListQuery,
  OrderStatus,
  PlaceOrderInput,
} from "../validations/order.validation.js";

type IdParams = { id: string };
type TrackingTokenParams = { token: string };
type NoParams = Record<string, never>;

/** POST /api/orders — PUBLIC, called by the customer app after a QR scan. */
export const place: RequestHandler<NoParams, unknown, PlaceOrderInput> = async (
  req,
  res
) => {
  // Passed through for the audit entry the service writes. There is no staff
  // actor on this route, so where the request came from is the only
  // provenance the trail can record.
  const order = await orderService.placeOrder(req.body, {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  res.status(201).json({
    success: true,
    message: "Order placed",
    data: order,
  });
};

/** GET /api/orders/track/:token — PUBLIC, authorised by the tracking token. */
export const track: RequestHandler<TrackingTokenParams> = async (req, res) => {
  const order = await orderService.trackByToken(req.params.token);

  res.json({ success: true, data: order });
};

/**
 * GET /api/orders/track/:token/invoice — PUBLIC, authorised by the token.
 *
 * The diner's own bill, so they can print it or save it as a PDF without
 * asking a member of staff.
 */
export const trackedInvoice: RequestHandler<TrackingTokenParams> = async (
  req,
  res
) => {
  const invoice = await invoiceService.getInvoiceByTrackingToken(req.params.token);

  res.json({ success: true, data: invoice });
};

/**
 * POST /api/orders/:id/approve — release a held large order to the kitchen.
 *
 * The actor is recorded on the order and in the audit trail, because the
 * control being exercised here is a named person confirming that a real party
 * is sitting at that table.
 */
export const approve: RequestHandler<IdParams> = async (req, res) => {
  const order = await orderService.approveOrder(req.params.id, req.user?.sub, {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  res.json({
    success: true,
    message: "Order released to the kitchen",
    data: order,
  });
};

/**
 * POST /api/orders/:id/reject — the waiter could not verify the table.
 *
 * The counterpart to approve, behind the same permission: whoever may vouch
 * for a table may also decline to. The reason is mandatory and lands in the
 * audit trail alongside who rejected it and when.
 */
export const reject: RequestHandler<IdParams, unknown, { reason: string }> = async (
  req,
  res
) => {
  const order = await orderService.rejectOrder(
    req.params.id,
    req.body.reason,
    req.user?.sub,
    { ipAddress: req.ip, userAgent: req.get("user-agent") }
  );

  res.json({ success: true, message: "Order rejected", data: order });
};

/**
 * POST /api/orders/track/:token/cancel — PUBLIC, the guest abandons their own
 * held order rather than paying the advance.
 *
 * Authorised by the tracking token, and only while the order is still held —
 * a guest cannot void food the kitchen has already started.
 */
export const cancelByGuest: RequestHandler<TrackingTokenParams> = async (
  req,
  res
) => {
  const order = await orderService.cancelHeldOrderByToken(req.params.token, {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  res.json({
    success: true,
    message: "Order cancelled",
    data: { orderNumber: order.orderNumber, status: order.status },
  });
};

/** GET /api/orders/:id/invoice — the staff-side bill for any order. */
export const invoice: RequestHandler<IdParams> = async (req, res) => {
  const document = await invoiceService.getInvoiceByOrderId(req.params.id);

  res.json({ success: true, data: document });
};

/** GET /api/orders */
export const list: RequestHandler = async (req, res) => {
  const query = req.validatedQuery as OrderListQuery;

  const { orders, meta } = await orderService.listOrders(query);

  res.json({ success: true, data: orders, meta });
};

/** GET /api/orders/kitchen — the Kitchen Display queue. */
export const kitchenQueue: RequestHandler = async (_req, res) => {
  const queue = await orderService.getKitchenQueue();

  res.json({ success: true, data: queue });
};

/** GET /api/orders/:id */
export const getById: RequestHandler<IdParams> = async (req, res) => {
  const order = await orderService.getOrderById(req.params.id);

  res.json({ success: true, data: order });
};

/** POST /api/orders/:id/items */
export const addItems: RequestHandler<IdParams, unknown, AddItemsInput> = async (
  req,
  res
) => {
  const order = await orderService.addItems(req.params.id, req.body);

  res.json({ success: true, message: "Items added", data: order });
};

/** PATCH /api/orders/:id/status */
export const updateStatus: RequestHandler<
  IdParams,
  unknown,
  { status: OrderStatus }
> = async (req, res) => {
  const order = await orderService.updateStatus(
    req.params.id,
    req.body.status,
    // Recorded so every status change is attributable to a staff member.
    req.user?.sub
  );

  res.json({
    success: true,
    message: `Order marked ${req.body.status.toLowerCase()}`,
    data: order,
  });
};

/** POST /api/orders/:id/serve — the waiter has taken it to the table. */
export const serve: RequestHandler<IdParams> = async (req, res) => {
  const order = await orderService.serveOrder(req.params.id, req.user?.sub);

  res.json({ success: true, message: "Order served", data: order });
};

/** POST /api/orders/:id/cancel */
export const cancel: RequestHandler<IdParams, unknown, { reason: string }> = async (
  req,
  res
) => {
  const order = await orderService.cancelOrder(
    req.params.id,
    req.body.reason,
    req.user?.sub
  );

  res.json({ success: true, message: "Order cancelled", data: order });
};

/**
 * PATCH /api/orders/:id/payment
 *
 * Handled by the payment service, not the order service: settling an order
 * writes the ledger as well as the summary, and the two must move together.
 */
export const updatePayment: RequestHandler<
  IdParams,
  unknown,
  {
    paymentStatus: "UNPAID" | "PAID" | "REFUNDED";
    paymentMethod?: "CASH" | "CARD" | "UPI" | "ONLINE";
    reason?: string;
  }
> = async (req, res) => {
  const order = await paymentService.settleOrderPayment(
    req.params.id,
    req.body.paymentStatus,
    req.body.paymentMethod,
    req.body.reason
  );

  res.json({ success: true, message: "Payment updated", data: order });
};
