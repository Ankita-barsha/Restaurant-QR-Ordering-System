import { Router } from "express";

import { PERMISSIONS } from "../config/permissions.js";
import * as orderController from "../controllers/order.controller.js";
import { audit } from "../middleware/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize, authorizeAny } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validations/common.validation.js";
import {
  addItemsSchema,
  cancelOrderSchema,
  orderListQuerySchema,
  orderNumberParamSchema,
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
 */
router.post("/", validate({ body: placeOrderSchema }), orderController.place);

router.get(
  "/track/:orderNumber",
  validate({ params: orderNumberParamSchema }),
  orderController.track
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
