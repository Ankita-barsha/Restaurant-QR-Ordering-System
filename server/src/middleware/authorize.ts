/**
 * Authorisation middleware — answers "may they do this?"
 *
 * Permission-based rather than role-based. Routes declare the CAPABILITY they
 * need (`order:update`), never the role that happens to have it. Adding a
 * "Shift Manager" role then means granting permissions in the admin UI, with
 * no code change and no redeploy — which is the entire point of your
 * Permission Management screen.
 */

import type { RequestHandler } from "express";

import { AppError } from "../utils/AppError.js";

/** Role name that bypasses permission checks. */
const SUPER_ADMIN_ROLE = "SUPER_ADMIN";

/**
 * Requires ALL of the given permission keys.
 *
 * Must be mounted after `authenticate`, which populates `req.user`.
 *
 * @example
 *   router.patch("/:id", authenticate, authorize("food:update"), handler)
 */
export const authorize = (...requiredPermissions: string[]): RequestHandler => {
  return (req, _res, next) => {
    const user = req.user;

    // Defensive: indicates authorize was mounted without authenticate, which
    // is a wiring bug rather than a failed login.
    if (!user) {
      throw AppError.unauthorized("Authentication required");
    }

    // The super admin is intentionally exempt: it must never be possible to
    // lock every administrator out by misconfiguring permissions.
    if (user.roleName === SUPER_ADMIN_ROLE) {
      next();
      return;
    }

    const granted = new Set(user.permissions);
    const missing = requiredPermissions.filter((key) => !granted.has(key));

    if (missing.length > 0) {
      // 403, not 404: the caller is authenticated, so hiding the route's
      // existence buys nothing. The message names what was missing so an
      // admin can fix the role, without revealing the full permission set.
      throw AppError.forbidden(
        `Missing required permission: ${missing.join(", ")}`
      );
    }

    next();
  };
};

/**
 * Requires AT LEAST ONE of the given permission keys.
 *
 * For endpoints reachable by different capabilities — e.g. an order is
 * visible to whoever may read orders OR whoever works the kitchen display.
 */
export const authorizeAny = (
  ...acceptedPermissions: string[]
): RequestHandler => {
  return (req, _res, next) => {
    const user = req.user;

    if (!user) {
      throw AppError.unauthorized("Authentication required");
    }

    if (user.roleName === SUPER_ADMIN_ROLE) {
      next();
      return;
    }

    const granted = new Set(user.permissions);
    const hasAny = acceptedPermissions.some((key) => granted.has(key));

    if (!hasAny) {
      throw AppError.forbidden(
        `Requires one of: ${acceptedPermissions.join(", ")}`
      );
    }

    next();
  };
};
