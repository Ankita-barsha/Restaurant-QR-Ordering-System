import { z } from "zod";

import { booleanish, paginationQuerySchema } from "./common.validation.js";

/** Mirrors the TableStatus enum in schema.prisma. */
export const tableStatusSchema = z.enum([
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "INACTIVE",
]);

export const createTableSchema = z.object({
  tableNumber: z
    .string()
    .trim()
    .min(1, "Table number is required")
    .max(20, "Table number is too long"),
  capacity: z.coerce
    .number()
    .int()
    .min(1, "Capacity must be at least 1")
    .max(50)
    .optional(),
  status: tableStatusSchema.optional(),
  isActive: booleanish.optional(),
});

export const updateTableSchema = createTableSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const tableListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  status: tableStatusSchema.optional(),
  includeInactive: booleanish.optional(),
});

/** The token embedded in a QR code. */
export const scanParamSchema = z.object({
  token: z.string().min(1, "token is required"),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type TableListQuery = z.infer<typeof tableListQuerySchema>;
