import { Router } from "express";

import { PERMISSIONS } from "../config/permissions.js";
import * as orderController from "../controllers/order.controller.js";
import { audit } from "../middleware/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize, authorizeAny } from "../middleware/authorize.js";
import { publicLookupLimiter, publicWriteLimiter } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validations/common.validation.js";
import {
  addItemsSchema,
  cancelOrderSchema,
  orderListQuerySchema,
  trackingTokenParamSchema,
  placeOrderSchema,
  updatePaymentSchema,
  updateStatusSchema,
} from "../validations/order.validation.js";

const router = Router();

/**
 * PUBLIC — the customer ordering flow.
 *
 * No authentication: a diner who scanned a QR code has no account. The table
 * is identified by its qrToken, and every price is resolved server-side.
 *
 * Both literal paths are registered before "/:id" so Express does not treat
 * "track" or "kitchen" as an order id.
 *
 * Rate limited per IP. With no account to authenticate, the limiter is the only
 * thing standing between an open write endpoint and a kitchen display full of
 * junk orders.
 */
router.post(
  "/",
  publicWriteLimiter,
  validate({ body: placeOrderSchema }),
  orderController.place
);

/**
 * Tracking is authorised by possession of the order's tracking token, issued
 * once in the response to POST /orders. It is NOT keyed on orderNumber: that
 * is a sequence value, so keying it there would expose every order — and its
 * invoice — to anyone counting upwards.
 */
router.get(
  "/track/:token",
  publicLookupLimiter,
  validate({ params: trackingTokenParamSchema }),
  orderController.track
);

/**
 * The diner's own invoice, authorised by the same token as tracking.
 *
 * Registered here, beside its sibling, and before "/:id" for the same reason.
 */
router.get(
  "/track/:token/invoice",
  publicLookupLimiter,
  validate({ params: trackingTokenParamSchema }),
  orderController.trackedInvoice
);

/** Kitchen Display queue — kitchen staff or anyone who may read orders. */
router.get(
  "/kitchen",
  authenticate,
  authorizeAny(PERMISSIONS.KITCHEN_ACCESS, PERMISSIONS.ORDER_READ),
  orderController.kitchenQueue
);

/** PROTECTED */
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.ORDER_READ),
  validate({ query: orderListQuerySchema }),
  orderController.list
);

router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.ORDER_READ),
  validate({ params: idParamSchema }),
  orderController.getById
);

/**
 * The invoice for an order.
 *
 * Behind order:read rather than a permission of its own: it restates figures
 * anyone who can open the order already sees, printed on the restaurant's
 * letterhead.
 */
router.get(
  "/:id/invoice",
  authenticate,
  authorize(PERMISSIONS.ORDER_READ),
  validate({ params: idParamSchema }),
  orderController.invoice
);

/** Staff adding to a running tab, e.g. "and another naan". */
router.post(
  "/:id/items",
  authenticate,
  authorize(PERMISSIONS.ORDER_CREATE),
  validate({ params: idParamSchema, body: addItemsSchema }),
  orderController.addItems
);

/** The transition the Kitchen Display drives. */
router.patch(
  "/:id/status",
  authenticate,
  authorize(PERMISSIONS.ORDER_UPDATE_STATUS),
  validate({ params: idParamSchema, body: updateStatusSchema }),
  audit({ action: "order.updateStatus", entity: "Order" }),
  orderController.updateStatus
);

/**
 * The waiter has taken the food to the table.
 *
 * Behind order:updateStatus, the same capability waiting staff already hold to
 * advance orders. It carries no body: the pickup code this endpoint once
 * required is gone from the product, and the table number on the ticket is
 * what the waiter actually works from.
 */
router.post(
  "/:id/serve",
  authenticate,
  authorize(PERMISSIONS.ORDER_UPDATE_STATUS),
  validate({ params: idParamSchema }),
  audit({ action: "order.serve", entity: "Order" }),
  orderController.serve
);

/**
 * Cancelling has its own permission: waiting staff advance orders, but
 * voiding one is a financial act restricted to managers.
 */
router.post(
  "/:id/cancel",
  authenticate,
  authorize(PERMISSIONS.ORDER_CANCEL),
  validate({ params: idParamSchema, body: cancelOrderSchema }),
  audit({ action: "order.cancel", entity: "Order" }),
  orderController.cancel
);

router.patch(
  "/:id/payment",
  authenticate,
  authorize(PERMISSIONS.ORDER_UPDATE_STATUS),
  validate({ params: idParamSchema, body: updatePaymentSchema }),
  audit({ action: "order.updatePayment", entity: "Order" }),
  orderController.updatePayment
);

export default router;
