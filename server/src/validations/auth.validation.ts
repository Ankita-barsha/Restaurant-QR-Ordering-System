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
    /**
     * Normalised BEFORE the format check, not after.
     *
     * Emails are case-insensitive in practice, so lowercasing prevents
     * "Admin@x.com" failing to match the stored "admin@x.com". Trimming has to
     * come first too: a trailing space — which phone keyboards and password
     * managers add routinely — otherwise fails the format check outright, and
     * the user is told their address is invalid when it is merely padded.
     */
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),

  password: z.string().min(1, "Password is required"),
});

/**
 * Refresh token input.
 *
 * Optional in the body because the token normally arrives as an httpOnly
 * cookie; the controller accepts either.
 *
 * `.default({})` is what makes the COOKIE path work at all. A browser calling
 * this endpoint has nothing to send — the token is in a cookie it cannot read —
 * so it posts no body, and Express 5 leaves `req.body` as `undefined` rather
 * than the empty object Express 4 supplied. Without the default, `z.object()`
 * rejected `undefined` with a 400 before the controller ever looked at the
 * cookie, so restoring a session on page load always failed and every staff
 * member was signed out by a browser refresh.
 */
export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .default({});

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
