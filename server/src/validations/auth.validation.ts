import { z } from "zod";

/**
 * Login input.
 *
 * Deliberately lenient on the password: enforcing complexity rules at LOGIN
 * would reject users whose password predates the rule, and reveals the policy
 * to attackers. Strength is enforced where passwords are SET, below.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    // Emails are case-insensitive in practice; normalising here prevents
    // "Admin@x.com" failing to match the stored "admin@x.com".
    .transform((value) => value.toLowerCase().trim()),

  password: z.string().min(1, "Password is required"),
});

/**
 * Refresh token input.
 *
 * Optional in the body because the token may instead arrive as an httpOnly
 * cookie; the controller accepts either.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

/** Password strength policy, applied wherever a password is chosen. */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
