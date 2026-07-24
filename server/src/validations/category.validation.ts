import { z } from "zod";

import { booleanish, paginationQuerySchema } from "./common.validation.js";

export { idParamSchema, slugParamSchema } from "./common.validation.js";

/** Category list query. */
export const listQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  includeInactive: booleanish.optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: booleanish.optional(),
});

/**
 * Update accepts any subset of the create fields, but rejects an empty body:
 * a PATCH with nothing to change is a client bug worth surfacing.
 */
export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
