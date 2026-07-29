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
 * A discount value.
 *
 * Shares the price schema's rules — non-negative, at most two decimal places,
 * kept as a STRING all the way to Prisma — because it is exact decimal data
 * for exactly the same reason a price is. A percentage written as 12.5 must
 * not become 12.499999999999998 on the way in.
 *
 * The upper bound depends on the discount TYPE and on the dish's own price, so
 * it cannot be checked here; the service does that against the price it is
 * about to save. See assertOfferIsCoherent.
 */
const offerValueSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
    message: "The discount must be a positive amount with at most 2 decimal places",
  });

/**
 * Multipart form fields arrive as strings, so numbers are coerced and booleans
 * use `booleanish` — never z.coerce.boolean(), which turns "false" into true.
 *
 * NOTE what is absent from the offer fields: `offerPrice`. It is DERIVED by
 * the server from the price and the discount, never accepted from the client
 * — for the same reason an order carries no prices. A client that could post
 * its own offer price could sell itself a dish for a rupee.
 */
export const createFoodSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(1000).optional(),
  price: priceSchema,
  categoryId: z.string().min(1, "categoryId is required"),
  isAvailable: booleanish.optional(),
  isVegetarian: booleanish.optional(),
  /** Chef's recommendation — surfaces the dish on the public welcome page. */
  isFeatured: booleanish.optional(),
  preparationMinutes: z.coerce.number().int().min(0).max(600).optional(),

  /** Promotional offer. See the note above about the absent offerPrice. */
  isOfferActive: booleanish.optional(),
  offerType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  offerValue: offerValueSchema.optional(),
  offerLabel: z.string().trim().max(40).optional(),
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
  /** Narrows to the chef's recommendations, which the welcome page asks for. */
  isFeatured: booleanish.optional(),
  /** Narrows to dishes currently on offer, for the menu's offers filter. */
  isOfferActive: booleanish.optional(),
  sortBy: z.enum(["name", "price", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/** Body for the availability toggle endpoint. */
export const availabilitySchema = z.object({
  isAvailable: booleanish,
});

/**
 * Body for the featured toggle endpoint.
 *
 * Its own endpoint for the same reason availability has one: marking a dish as
 * the chef's recommendation is a one-tap action taken from the menu list, and
 * routing it through the full edit form would mean re-submitting the price and
 * the photo just to change a flag.
 */
export const featuredSchema = z.object({
  isFeatured: booleanish,
});

export type CreateFoodInput = z.infer<typeof createFoodSchema>;
export type UpdateFoodInput = z.infer<typeof updateFoodSchema>;
export type FoodListQuery = z.infer<typeof foodListQuerySchema>;
