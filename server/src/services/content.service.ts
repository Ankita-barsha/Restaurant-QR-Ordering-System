/**
 * Content management: the copy on the public welcome page, and the curated
 * customer reviews shown beneath it.
 *
 * Both exist so the marketing surface of the site can change without a
 * deploy. Nothing here is customer-submitted — an admin writes it, an admin
 * publishes it.
 */

import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import { storage } from "../utils/storage.js";
import type {
  CreateReviewInput,
  ReviewListQuery,
  UpdateContentInput,
  UpdateReviewInput,
} from "../validations/content.validation.js";

const CONTENT_ID = "singleton";

// ---------------------------------------------------------------------------
// Site content
// ---------------------------------------------------------------------------

/**
 * Reads the content singleton, creating it if it is somehow absent.
 *
 * upsert rather than findUnique + throw, for the same reason settings does it:
 * the welcome page is the first thing every diner loads, and a missing row
 * must not take the public site down.
 */
export const getContent = async () =>
  prisma.siteContent.upsert({
    where: { id: CONTENT_ID },
    update: {},
    create: { id: CONTENT_ID },
  });

/**
 * Writes the content singleton.
 *
 * An empty string is stored as NULL rather than as "". Both render as nothing,
 * but only NULL lets the welcome page tell "the editor cleared this, use the
 * built-in copy" apart from "the editor typed a space". Keeping one
 * representation of absent also stops `content.heroTitle || fallback` from
 * behaving differently for two values that look identical in the admin form.
 */
export const updateContent = async (input: UpdateContentInput) => {
  const data = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? null : value])
  );

  return prisma.siteContent.upsert({
    where: { id: CONTENT_ID },
    update: data,
    create: { id: CONTENT_ID, ...data },
  });
};

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/**
 * Lists reviews.
 *
 * `includeHidden` is honoured only when the caller has been authorised for it
 * — the route checks the permission, this function trusts the flag. Public
 * callers therefore never see an unpublished testimonial.
 *
 * Ordered by sortOrder then newest first: the house curates the lead review,
 * and everything it has not ranked falls back to recency rather than to an
 * arbitrary insertion order.
 */
export const listReviews = async (
  query: ReviewListQuery,
  includeHidden = false
): Promise<{ reviews: unknown[]; meta: PaginationMeta }> => {
  const pagination = getPagination(query.page, query.limit);

  const where = includeHidden && query.includeHidden ? {} : { isVisible: true };

  const [reviews, total] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    prisma.review.count({ where }),
  ]);

  return { reviews, meta: buildPaginationMeta(pagination, total) };
};

export const getReviewById = async (id: string) => {
  const review = await prisma.review.findUnique({ where: { id } });

  if (!review) {
    throw AppError.notFound("Review not found");
  }

  return review;
};

export const createReview = async (
  input: CreateReviewInput,
  imageUrl?: string,
  /** When true the review is hidden by default and waits for admin approval. */
  pendingApproval = false
) =>
  prisma.review.create({
    data: {
      customerName: input.customerName,
      rating: input.rating,
      comment: input.comment,
      visitedOn: input.visitedOn,
      imageUrl,
      // Customer-submitted reviews start hidden; admin-added ones are visible.
      isVisible: pendingApproval ? false : (input.isVisible ?? true),
      sortOrder: input.sortOrder ?? 0,
    },
  });

export const updateReview = async (
  id: string,
  input: UpdateReviewInput,
  imageUrl?: string
) => {
  const existing = await getReviewById(id);

  const updated = await prisma.review.update({
    where: { id },
    data: { ...input, ...(imageUrl ? { imageUrl } : {}) },
  });

  // The old portrait is removed only after the row is safely updated. Doing it
  // first would lose the file if the update then failed — the same ordering
  // food.service uses for dish photos.
  if (imageUrl && existing.imageUrl) {
    await storage.remove(existing.imageUrl);
  }

  return updated;
};

/** Publishes or withdraws a review without touching its text. */
export const setReviewVisibility = async (id: string, isVisible: boolean) => {
  await getReviewById(id);

  return prisma.review.update({ where: { id }, data: { isVisible } });
};

/**
 * Deletes a review outright.
 *
 * A hard delete, unlike the menu's soft deletes: nothing references a review,
 * so removing one rewrites no history. Admins who only want it off the site
 * should hide it instead, which is the one-tap control on the list.
 */
export const deleteReview = async (id: string): Promise<void> => {
  const review = await getReviewById(id);

  await prisma.review.delete({ where: { id } });

  // Safe to remove now: the row that referenced the file is gone.
  await storage.remove(review.imageUrl);
};
