/**
 * Where a signed-in staff member lands.
 *
 * Kept in lib/ rather than beside the Login screen because the root redirect
 * needs it too. Importing it from Login would pull the whole login page — and
 * with it the staff chunk — into the bundle every diner downloads, which is
 * exactly what lazy-loading the staff routes is there to avoid.
 */

import type { AuthUser } from "../types/api";

/** Chooses the landing screen from what the user can actually do. */
export const homeRouteFor = (user: AuthUser): string => {
  const isSuperAdmin = user.role.name === "SUPER_ADMIN";
  const has = (permission: string) =>
    isSuperAdmin || user.permissions.includes(permission);

  // Each role lands on the single screen its job is built around.
  if (user.role.name === "KITCHEN") return "/kitchen";
  if (user.role.name === "STAFF") return "/serve";
  if (has("dashboard:view")) return "/admin";
  if (has("kitchen:access")) return "/kitchen";
  if (has("order:read")) return "/staff";

  return "/serve";
};
