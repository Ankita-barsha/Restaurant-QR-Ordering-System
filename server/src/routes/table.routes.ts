import { Router } from "express";
import { z } from "zod";

import { PERMISSIONS } from "../config/permissions.js";
import * as tableController from "../controllers/table.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { booleanish, idParamSchema } from "../validations/common.validation.js";
import {
  createTableSchema,
  scanParamSchema,
  tableListQuerySchema,
  updateTableSchema,
} from "../validations/table.validation.js";

const router = Router();

/**
 * PUBLIC — the QR scan endpoint.
 *
 * Mounted before "/:id" so the literal path "scan" is matched first; Express
 * routes in registration order, and "/:id" would otherwise swallow it and
 * treat "scan" as a table id.
 */
router.get(
  "/scan/:token",
  validate({ params: scanParamSchema }),
  tableController.scan
);

/** PROTECTED */
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.TABLE_READ),
  validate({ query: tableListQuerySchema }),
  tableController.list
);

router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.TABLE_READ),
  validate({ params: idParamSchema }),
  tableController.getById
);

router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.TABLE_CREATE),
  validate({ body: createTableSchema }),
  tableController.create
);

router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.TABLE_UPDATE),
  validate({ params: idParamSchema, body: updateTableSchema }),
  tableController.update
);

router.patch(
  "/:id/active",
  authenticate,
  authorize(PERMISSIONS.TABLE_UPDATE),
  validate({ params: idParamSchema, body: z.object({ isActive: booleanish }) }),
  tableController.setActive
);

/**
 * QR management sits behind its own permission: rotating a token invalidates
 * a physically printed sticker, so it is a more consequential act than
 * renaming a table.
 */
router.post(
  "/:id/qr/rotate",
  authenticate,
  authorize(PERMISSIONS.QR_MANAGE),
  validate({ params: idParamSchema }),
  tableController.rotateQr
);

router.post(
  "/:id/qr/regenerate",
  authenticate,
  authorize(PERMISSIONS.QR_MANAGE),
  validate({ params: idParamSchema }),
  tableController.regenerateQr
);

router.delete(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.TABLE_DELETE),
  validate({ params: idParamSchema }),
  tableController.remove
);

export default router;
