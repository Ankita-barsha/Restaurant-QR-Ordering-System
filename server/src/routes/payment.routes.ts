import { Router } from "express";

import { PERMISSIONS } from "../config/permissions.js";
import * as paymentController from "../controllers/payment.controller.js";
import { audit } from "../middleware/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validations/common.validation.js";
import {
  cashPaymentSchema,
  confirmPaymentSchema,
  initiatePaymentSchema,
  paymentListQuerySchema,
} from "../validations/payment.validation.js";

const router = Router();

/**
 * PUBLIC — the customer payment flow.
 *
 * A diner who scanned a QR code has no account. They start a payment for the
 * order they placed and confirm it with the unguessable payment id returned
 * to them; no other order is reachable.
 */
router.post(
  "/online",
  validate({ body: initiatePaymentSchema }),
  paymentController.initiate
);

router.post(
  "/:id/confirm",
  validate({ params: idParamSchema, body: confirmPaymentSchema }),
  paymentController.confirm
);

router.get(
  "/:id/receipt",
  validate({ params: idParamSchema }),
  paymentController.receipt
);

/** Staff records a cash payment. Same capability that advances orders. */
router.post(
  "/cash",
  authenticate,
  authorize(PERMISSIONS.ORDER_UPDATE_STATUS),
  validate({ body: cashPaymentSchema }),
  audit({ action: "payment.cash", entity: "Payment" }),
  paymentController.recordCash
);

/** Payment history — behind report:view, which managers and super admin hold. */
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.REPORT_VIEW),
  validate({ query: paymentListQuerySchema }),
  paymentController.list
);

export default router;
