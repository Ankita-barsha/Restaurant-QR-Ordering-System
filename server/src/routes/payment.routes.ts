import { Router } from "express";

import { PERMISSIONS } from "../config/permissions.js";
import * as paymentController from "../controllers/payment.controller.js";
import { audit } from "../middleware/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { publicLookupLimiter, publicWriteLimiter } from "../middleware/security.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validations/common.validation.js";
import {
  cashPaymentSchema,
  confirmPaymentSchema,
  initiatePaymentSchema,
  paymentListQuerySchema,
  refundPaymentSchema,
} from "../validations/payment.validation.js";

const router = Router();

/**
 * PUBLIC — the customer payment flow.
 *
 * A diner who scanned a QR code has no account. They start a payment for the
 * order they placed and confirm it with the unguessable payment id returned
 * to them; no other order is reachable.
 *
 * Rate limited per IP. Creating payment intents is a write, and an unmetered
 * one against a real gateway costs money as well as rows.
 */
router.post(
  "/online",
  publicWriteLimiter,
  validate({ body: initiatePaymentSchema }),
  paymentController.initiate
);

router.post(
  "/:id/confirm",
  publicWriteLimiter,
  validate({ params: idParamSchema, body: confirmPaymentSchema }),
  paymentController.confirm
);

router.get(
  "/:id/receipt",
  publicLookupLimiter,
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

/**
 * Reversing a payment.
 *
 * Behind order:cancel rather than report:view: refunding is money leaving the
 * business, the same class of act as voiding an order, and waiting staff who
 * can take a payment must not be able to undo one. Audited for the same reason.
 */
router.post(
  "/:id/refund",
  authenticate,
  authorize(PERMISSIONS.ORDER_CANCEL),
  validate({ params: idParamSchema, body: refundPaymentSchema }),
  audit({ action: "payment.refund", entity: "Payment" }),
  paymentController.refund
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
