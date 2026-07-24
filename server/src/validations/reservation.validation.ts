import { z } from "zod";

import { paginationQuerySchema } from "./common.validation.js";

export const reservationStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "SEATED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

/**
 * A booking request from the public site.
 *
 * `reservedAt` is a full ISO instant rather than separate date and time
 * fields: the client already knows the guest's timezone, and combining them
 * on the server would guess it wrong for anyone travelling.
 */
export const createReservationSchema = z.object({
  name: z.string().trim().min(2, "Please give a name for the booking").max(80),
  phone: z
    .string()
    .trim()
    .min(6, "A contact number is required")
    .max(20)
    .regex(/^[+\d][\d\s-]*$/, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email address").optional(),

  partySize: z.coerce
    .number()
    .int("Party size must be a whole number")
    .min(1, "At least one guest")
    .max(20, "For parties over 20, please call the restaurant"),

  reservedAt: z.coerce
    .date()
    .refine((value) => value.getTime() > Date.now(), {
      message: "Choose a time in the future",
    })
    // A year ahead is almost always a typo in the year field.
    .refine((value) => value.getTime() < Date.now() + 365 * 86_400_000, {
      message: "Bookings open up to a year ahead",
    }),

  occasion: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(400).optional(),
});

export const updateReservationSchema = z
  .object({
    partySize: z.coerce.number().int().min(1).max(20).optional(),
    reservedAt: z.coerce.date().optional(),
    durationMinutes: z.coerce.number().int().min(30).max(360).optional(),
    tableId: z.string().min(1).optional(),
    occasion: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(400).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const reservationStatusUpdateSchema = z.object({
  status: reservationStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

export const reservationListQuerySchema = paginationQuerySchema.extend({
  status: reservationStatusSchema.optional(),
  search: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Convenience filter the floor view uses constantly. */
  today: z.enum(["true", "false"]).optional(),
});

/** Public lookup by the code printed on the confirmation. */
export const referenceParamSchema = z.object({
  reference: z.string().min(1, "reference is required"),
});

/** Availability probe used by the booking form before submitting. */
export const availabilityQuerySchema = z.object({
  date: z.coerce.date(),
  partySize: z.coerce.number().int().min(1).max(20),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;
export type ReservationListQuery = z.infer<typeof reservationListQuerySchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
