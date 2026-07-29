/**
 * Welcome-page content and the curated review list.
 */

import type { RequestHandler } from "express";

import { PERMISSIONS } from "../config/permissions.js";
import * as contentService from "../services/content.service.js";
import { storage } from "../utils/storage.js";
import type {
  CreateReviewInput,
  ReviewListQuery,
  UpdateContentInput,
  UpdateReviewInput,
} from "../validations/content.validation.js";

type IdParams = { id: string };
type NoParams = Record<string, never>;

/** See the note in food.controller: undefined means "keep the current image". */
const uploadedImageUrl = (file?: Express.Multer.File): string | undefined =>
  file ? storage.toPublicUrl(file.filename) : undefined;

// ---------------------------------------------------------------------------
// Site content
// ---------------------------------------------------------------------------

/** GET /api/content — PUBLIC, read by the welcome page on every visit. */
export const getContent: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await contentService.getContent() });
};

/** PATCH /api/content */
export const updateContent: RequestHandler<
  NoParams,
  unknown,
  UpdateContentInput
> = async (req, res) => {
  const content = await contentService.updateContent(req.body);

  res.json({ success: true, message: "Content updated", data: content });
};

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/**
 * GET /api/content/reviews — PUBLIC, but richer for staff.
 *
 * The route is unauthenticated so the welcome page can read it, yet the admin
 * screen needs the hidden ones too. Rather than a second near-identical
 * endpoint, `includeHidden` is honoured only when the caller actually holds
 * review:read — checked HERE, from req.user, never from the query string
 * alone. An anonymous request asking for hidden reviews simply does not get
 * them.
 */
export const listReviews: RequestHandler = async (req, res) => {
  const query = req.validatedQuery as ReviewListQuery;

  const maySeeHidden =
    req.user?.roleName === "SUPER_ADMIN" ||
    Boolean(req.user?.permissions.includes(PERMISSIONS.REVIEW_READ));

  const { reviews, meta } = await contentService.listReviews(query, maySeeHidden);

  res.json({ success: true, data: reviews, meta });
};

/** POST /api/content/reviews — multipart/form-data, optional `image` field. */
export const createReview: RequestHandler<
  NoParams,
  unknown,
  CreateReviewInput
> = async (req, res) => {
  const review = await contentService.createReview(
    req.body,
    uploadedImageUrl(req.file)
  );

  res.status(201).json({ success: true, message: "Review published", data: review });
};

/** PATCH /api/content/reviews/:id */
export const updateReview: RequestHandler<
  IdParams,
  unknown,
  UpdateReviewInput
> = async (req, res) => {
  const review = await contentService.updateReview(
    req.params.id,
    req.body,
    uploadedImageUrl(req.file)
  );

  res.json({ success: true, message: "Review updated", data: review });
};

/** PATCH /api/content/reviews/:id/visibility */
export const toggleReviewVisibility: RequestHandler<
  IdParams,
  unknown,
  { isVisible: boolean }
> = async (req, res) => {
  const review = await contentService.setReviewVisibility(
    req.params.id,
    req.body.isVisible
  );

  res.json({
    success: true,
    message: req.body.isVisible ? "Review published" : "Review hidden",
    data: review,
  });
};

/** DELETE /api/content/reviews/:id */
export const removeReview: RequestHandler<IdParams> = async (req, res) => {
  await contentService.deleteReview(req.params.id);

  res.json({ success: true, message: "Review deleted" });
};
