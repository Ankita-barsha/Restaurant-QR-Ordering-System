import { z } from "zod";

import { booleanish, paginationQuerySchema } from "./common.validation.js";

// ---------------------------------------------------------------------------
// Site content (the CMS)
// ---------------------------------------------------------------------------

/**
 * A single editable slot of copy.
 *
 * Blank is meaningful here and means "clear this and fall back to the built-in
 * text", so unlike every other optional string in this codebase an empty
 * string is ACCEPTED rather than rejected. The service converts it to NULL.
 *
 * Without that, an editor who wanted to remove a line they had written would
 * have no way to say so: omitting the field leaves the old value in place.
 */
const copy = (max: number) => z.string().trim().max(max).optional();

/**
 * Every field is optional and the whole body may be empty.
 *
 * Deliberately NOT refined to "at least one field", as the other update
 * schemas are. The admin form submits every box at once, and an editor who
 * cleared all of them is making a real request — one that empties the CMS and
 * restores the built-in copy — not a client bug.
 */
export const updateContentSchema = z.object({
  heroEyebrow: copy(80),
  heroTitle: copy(120),
  heroLede: copy(600),

  bannerText: copy(200),

  featuredEyebrow: copy(80),
  featuredTitle: copy(120),
  featuredLede: copy(600),

  aboutEyebrow: copy(80),
  aboutTitle: copy(120),
  aboutBody: copy(4000),

  footerNote: copy(600),
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/**
 * Multipart form fields arrive as strings, so numbers are coerced and the
 * flag uses `booleanish` — see the note in common.validation.
 */
export const createReviewSchema = z.object({
  customerName: z.string().trim().min(2, "Whose review is this?").max(80),
  rating: z.coerce
    .number()
    .int("Rating must be a whole number")
    .min(1, "Rating must be between 1 and 5")
    .max(5, "Rating must be between 1 and 5"),
  comment: z.string().trim().min(4, "The review needs some words").max(1000),
  /** ISO date. Optional: an undated testimonial is still usable. */
  visitedOn: z.coerce.date().optional(),
  isVisible: booleanish.optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateReviewSchema = createReviewSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

/** Body for the publish/hide toggle. */
export const reviewVisibilitySchema = z.object({
  isVisible: booleanish,
});

/**
 * Hidden reviews are withheld unless `includeHidden` is set, which the route
 * only honours for a signed-in caller holding review:read.
 */
export const reviewListQuerySchema = paginationQuerySchema.extend({
  includeHidden: booleanish.optional(),
});

export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
