import { z } from "zod";

import { passwordSchema } from "./auth.validation.js";
import { booleanish, paginationQuerySchema } from "./common.validation.js";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  email: z
    .string()
    .email("Enter a valid email address")
    .transform((value) => value.toLowerCase().trim()),
  password: passwordSchema,
  fullName: z.string().trim().min(2, "Full name is required").max(100),
  phone: z.string().trim().min(6).max(20).optional(),
  roleId: z.string().min(1, "roleId is required"),
  isActive: booleanish.optional(),
});

/**
 * Password is absent from the update schema on purpose. Changing someone
 * else's password is a distinct, more sensitive action with its own endpoint,
 * not a field buried in a general profile edit.
 */
export const updateUserSchema = z
  .object({
    email: z
      .string()
      .email()
      .transform((value) => value.toLowerCase().trim())
      .optional(),
    fullName: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().min(6).max(20).optional(),
    roleId: z.string().min(1).optional(),
    isActive: booleanish.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

export const userListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  roleId: z.string().min(1).optional(),
  includeInactive: booleanish.optional(),
});

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(40)
    // Uppercase snake case keeps role names usable as stable identifiers.
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE, e.g. SHIFT_MANAGER"),
  description: z.string().trim().max(200).optional(),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(40).regex(/^[A-Z][A-Z0-9_]*$/).optional(),
    description: z.string().trim().max(200).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

/** Replaces a role's permission set wholesale. */
export const setRolePermissionsSchema = z.object({
  permissionKeys: z.array(z.string().min(1)),
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    phone: z.string().trim().min(6).max(20).optional(),
    email: z.string().email().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const customerListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Restaurant settings
// ---------------------------------------------------------------------------

/** Percentages are strings for the same reason prices are: exact decimals. */
const percentSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,3}(\.\d{1,2})?$/.test(value), {
    message: "Must be a percentage with at most 2 decimal places",
  })
  .refine((value) => Number(value) <= 100, { message: "Cannot exceed 100%" });

/** "HH:mm" wall-clock time, stored as text so it never shifts with timezones. */
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm, e.g. 09:30");

export const updateSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    tagline: z.string().trim().max(200).optional(),
    email: z.string().email().optional(),
    phone: z.string().trim().min(6).max(20).optional(),
    addressLine: z.string().trim().max(200).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().trim().max(80).optional(),
    currency: z.string().trim().length(3, "Use a 3-letter ISO code").optional(),
    taxPercent: percentSchema.optional(),
    serviceChargePercent: percentSchema.optional(),
    isAcceptingOrders: booleanish.optional(),
    openingTime: timeSchema.optional(),
    closingTime: timeSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const revenuePeriodSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly", "yearly"]).default("daily"),
});

export const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * Highest-selling items.
 *
 * Extends the shared report window with how to rank and what to count. Its own
 * schema rather than more optional fields on reportQuerySchema, so the sales
 * and order-status reports do not advertise parameters they ignore.
 *
 * `scope` defaults to completed orders: a dish still in the pass may yet be
 * cancelled, and a best-seller list that moves backwards during service is
 * measuring the kitchen, not sales.
 */
export const topItemsQuerySchema = reportQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(50).optional(),
  sort: z.enum(["quantity", "revenue"]).default("quantity"),
  scope: z.enum(["completed", "all"]).default("completed"),
});

export const auditListQuerySchema = paginationQuerySchema.extend({
  actorId: z.string().min(1).optional(),
  entity: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type TopItemsQuery = z.infer<typeof topItemsQuerySchema>;
export type RevenuePeriodQuery = z.infer<typeof revenuePeriodSchema>;
export type AuditListQueryInput = z.infer<typeof auditListQuerySchema>;
