import { Router } from "express";

import { PERMISSIONS } from "../config/permissions.js";
import * as foodController from "../controllers/food.controller.js";
import { audit } from "../middleware/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { uploadImage, verifyUploadedImage } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import {
  availabilitySchema,
  createFoodSchema,
  foodListQuerySchema,
  updateFoodSchema,
} from "../validations/food.validation.js";
import {
  idParamSchema,
  slugParamSchema,
} from "../validations/common.validation.js";

const router = Router();

/** PUBLIC — customer menu browsing, search and category filtering. */
router.get("/", validate({ query: foodListQuerySchema }), foodController.list);

router.get(
  "/slug/:slug",
  validate({ params: slugParamSchema }),
  foodController.getBySlug
);

/** PROTECTED */
router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.FOOD_READ),
  validate({ params: idParamSchema }),
  foodController.getById
);

/**
 * Middleware order is significant on the write routes:
 *
 *   authenticate       — who are you
 *   authorize          — may you do this
 *   uploadImage        — parse multipart; populates req.body AND req.file
 *   verifyUploadedImage— confirm the bytes really are an image
 *   validate           — check the now-populated text fields
 *
 * uploadImage MUST precede validate: with multipart/form-data, req.body does
 * not exist until multer has parsed the stream, so validating first would see
 * an empty body and reject every request.
 */
router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.FOOD_CREATE),
  uploadImage("image"),
  verifyUploadedImage,
  validate({ body: createFoodSchema }),
  audit({ action: "food.create", entity: "Food" }),
  foodController.create
);

router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.FOOD_UPDATE),
  uploadImage("image"),
  verifyUploadedImage,
  validate({ params: idParamSchema, body: updateFoodSchema }),
  audit({ action: "food.update", entity: "Food" }),
  foodController.update
);

/**
 * Availability has its own endpoint and its own permission: kitchen and
 * waiting staff must be able to mark an item sold out without holding the
 * broader food:update rights that let them change prices.
 */
router.patch(
  "/:id/availability",
  authenticate,
  authorize(PERMISSIONS.FOOD_READ),
  validate({ params: idParamSchema, body: availabilitySchema }),
  foodController.toggleAvailability
);

router.delete(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.FOOD_DELETE),
  validate({ params: idParamSchema }),
  audit({ action: "food.delete", entity: "Food" }),
  foodController.remove
);

export default router;
