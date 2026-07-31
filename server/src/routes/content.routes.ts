/**
 * Content management routes.
 *
 * The welcome page is public, so every READ here is public and every WRITE
 * names the capability it needs — the same shape the menu routes use.
 */

import { Router } from "express";

import { PERMISSIONS } from "../config/permissions.js";
import * as contentController from "../controllers/content.controller.js";
import { audit } from "../middleware/audit.js";
import { authenticate, optionalAuthenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { uploadImage, verifyUploadedImage } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validations/common.validation.js";
import {
  createReviewSchema,
  reviewListQuerySchema,
  reviewVisibilitySchema,
  updateContentSchema,
  updateReviewSchema,
} from "../validations/content.validation.js";

const router = Router();

// ---------------------------------------------------------------------------
// Reviews
//
// Registered BEFORE the "/" content routes only for readability; Express
// matches on the full path, so the order of these two groups is not load
// bearing the way "/track" before "/:id" is in the order router.
// ---------------------------------------------------------------------------

/**
 * PUBLIC — the testimonials on the welcome page.
 *
 * optionalAuthenticate rather than authenticate: an anonymous diner must be
 * able to read this, while a signed-in admin holding review:read additionally
 * gets the hidden ones by passing `includeHidden`. The controller decides,
 * from the token, whether to honour that flag — the query string alone can
 * never unlock an unpublished review.
 */
router.get(
  "/reviews",
  optionalAuthenticate,
  validate({ query: reviewListQuerySchema }),
  contentController.listReviews
);

/**
 * PUBLIC — Diners can submit reviews after a meal, and staff can add testimonials.
 */
router.post(
  "/reviews",
  optionalAuthenticate,
  uploadImage("image"),
  verifyUploadedImage,
  validate({ body: createReviewSchema }),
  contentController.createReview
);

router.patch(
  "/reviews/:id",
  authenticate,
  authorize(PERMISSIONS.REVIEW_UPDATE),
  uploadImage("image"),
  verifyUploadedImage,
  validate({ params: idParamSchema, body: updateReviewSchema }),
  audit({ action: "review.update", entity: "Review" }),
  contentController.updateReview
);

/**
 * Publish / hide has its own endpoint for the same reason "sold out" does:
 * it is the control used most, and routing it through the full edit form
 * would mean re-submitting the review text to flip a flag.
 */
router.patch(
  "/reviews/:id/visibility",
  authenticate,
  authorize(PERMISSIONS.REVIEW_UPDATE),
  validate({ params: idParamSchema, body: reviewVisibilitySchema }),
  contentController.toggleReviewVisibility
);

router.delete(
  "/reviews/:id",
  authenticate,
  authorize(PERMISSIONS.REVIEW_DELETE),
  validate({ params: idParamSchema }),
  audit({ action: "review.delete", entity: "Review" }),
  contentController.removeReview
);

// ---------------------------------------------------------------------------
// Site content
// ---------------------------------------------------------------------------

/** PUBLIC — the copy the welcome page renders. */
router.get("/", contentController.getContent);

router.patch(
  "/",
  authenticate,
  authorize(PERMISSIONS.CONTENT_UPDATE),
  validate({ body: updateContentSchema }),
  audit({ action: "content.update", entity: "SiteContent" }),
  contentController.updateContent
);

export default router;
