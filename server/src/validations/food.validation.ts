import { z } from "zod";

import { booleanish, paginationQuerySchema } from "./common.validation.js";

/**
 * Price input.
 *
 * Accepted as a STRING and kept as one all the way to Prisma, which converts
 * it to an exact Decimal. Parsing it into a JavaScript number first would
 * introduce the very floating-point error the Decimal column exists to avoid.
 */
const priceSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
    message: "Price must be a positive amount with at most 2 decimal places",
  })
  .refine((value) => Number(value) > 0, { message: "Price must be greater than 0" })
  .refine((value) => Number(value) < 100_000_000, { message: "Price is too large" });

/**
 * Multipart form fields arrive as strings, so numbers are coerced and booleans
 * use `booleanish` — never z.coerce.boolean(), which turns "false" into true.
 */
export const createFoodSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(1000).optional(),
  price: priceSchema,
  categoryId: z.string().min(1, "categoryId is required"),
  isAvailable: booleanish.optional(),
  isVegetarian: booleanish.optional(),
  preparationMinutes: z.coerce.number().int().min(0).max(600).optional(),
});

export const updateFoodSchema = createFoodSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

/** Menu listing supports category filtering and search on top of paging. */
export const foodListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  /** Slug alternative, so the customer menu can filter without knowing ids. */
  category: z.string().min(1).optional(),
  isVegetarian: booleanish.optional(),
  includeUnavailable: booleanish.optional(),
  sortBy: z.enum(["name", "price", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/** Body for the availability toggle endpoint. */
export const availabilitySchema = z.object({
  isAvailable: booleanish,
});

export type CreateFoodInput = z.infer<typeof createFoodSchema>;
export type UpdateFoodInput = z.infer<typeof updateFoodSchema>;
export type FoodListQuery = z.infer<typeof foodListQuerySchema>;
