import { Router } from "express";

import { PERMISSIONS } from "../config/permissions.js";
import * as categoryController from "../controllers/category.controller.js";
import { audit } from "../middleware/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import {
  createCategorySchema,
  listQuerySchema,
  updateCategorySchema,
} from "../validations/category.validation.js";
import {
  idParamSchema,
  slugParamSchema,
} from "../validations/common.validation.js";

const router = Router();

/**
 * PUBLIC — the customer menu is reachable by anyone who scans a QR code.
 * These return only active, non-deleted categories.
 */
router.get("/", validate({ query: listQuerySchema }), categoryController.list);

router.get(
  "/slug/:slug",
  validate({ params: slugParamSchema }),
  categoryController.getBySlug
);

/**
 * PROTECTED — each route states the capability it needs. Read the middleware
 * chain to know exactly who may call it.
 */
router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.CATEGORY_READ),
  validate({ params: idParamSchema }),
  categoryController.getById
);

router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.CATEGORY_CREATE),
  validate({ body: createCategorySchema }),
  audit({ action: "category.create", entity: "Category" }),
  categoryController.create
);

router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.CATEGORY_UPDATE),
  validate({ params: idParamSchema, body: updateCategorySchema }),
  audit({ action: "category.update", entity: "Category" }),
  categoryController.update
);

router.delete(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.CATEGORY_DELETE),
  validate({ params: idParamSchema }),
  audit({ action: "category.delete", entity: "Category" }),
  categoryController.remove
);

export default router;
