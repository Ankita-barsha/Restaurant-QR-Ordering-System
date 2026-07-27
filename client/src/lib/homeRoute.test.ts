/**
 * Where a signed-in staff member lands.
 *
 * Worth testing because the failure is silent and confusing: a chef sent to
 * the dashboard sees a screen they have no permission to load, and blames the
 * login rather than the routing.
 */

import { describe, expect, it } from "vitest";

import { homeRouteFor } from "./homeRoute";
import type { AuthUser } from "../types/api";

const user = (roleName: string, permissions: string[] = []): AuthUser => ({
  id: "u1",
  email: "someone@restaurant.local",
  fullName: "Someone",
  role: { id: "r1", name: roleName },
  permissions,
});

describe("homeRouteFor", () => {
  it("sends each built-in role to the screen its job is built around", () => {
    expect(homeRouteFor(user("KITCHEN", ["kitchen:access"]))).toBe("/kitchen");
    expect(homeRouteFor(user("STAFF", ["order:read"]))).toBe("/serve");
    expect(homeRouteFor(user("ADMIN", ["dashboard:view"]))).toBe("/admin");
  });

  it("sends a super admin to the dashboard without needing the grant", () => {
    // SUPER_ADMIN bypasses permission checks on the server, so its permission
    // list is empty; the routing has to know that too.
    expect(homeRouteFor(user("SUPER_ADMIN"))).toBe("/admin");
  });

  it("falls back through capabilities for a custom role", () => {
    expect(homeRouteFor(user("MANAGER", ["dashboard:view"]))).toBe("/admin");
    expect(homeRouteFor(user("CHEF", ["kitchen:access"]))).toBe("/kitchen");
    expect(homeRouteFor(user("EXPEDITER", ["order:read"]))).toBe("/staff");
  });

  it("never returns a route the user cannot open, even with no permissions", () => {
    // /serve is the floor screen every staff account can reach. Landing
    // somewhere forbidden would look like a broken login.
    expect(homeRouteFor(user("NEW_ROLE", []))).toBe("/serve");
  });
});
