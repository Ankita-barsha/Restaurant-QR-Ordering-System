import { z } from "zod";

/**
 * Boolean from HTML form / query-string input.
 *
 * DO NOT use z.coerce.boolean() for this. It applies JavaScript's Boolean(),
 * and every non-empty string is truthy — so the string "false" becomes `true`:
 *
 *   Boolean("false") === true
 *   Boolean("0")     === true
 *
 * Multipart form fields and query parameters are ALWAYS strings, so
 * z.coerce.boolean() silently turns every "unchecked" checkbox into `true`.
 * This schema matches the literal text instead, and rejects anything else
 * rather than guessing.
 */
export const booleanish = z.union([
  z.boolean(),
  z
    .enum(["true", "false", "1", "0"])
    .transform((value) => value === "true" || value === "1"),
]);

/** Reusable cuid path parameter. */
export const idParamSchema = z.object({
  id: z.string().min(1, "id is required"),
});

/** Reusable slug path parameter. */
export const slugParamSchema = z.object({
  slug: z.string().min(1, "slug is required"),
});

/** Shared paging controls for list endpoints. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
