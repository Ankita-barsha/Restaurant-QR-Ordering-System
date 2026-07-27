/**
 * Auth input schemas.
 *
 * The refresh cases exist because of a real outage in the session flow: the
 * browser posts NO body to /auth/refresh (the token is in an httpOnly cookie it
 * cannot read), Express 5 leaves req.body as `undefined`, and the schema
 * rejected it with a 400 before the controller ever looked at the cookie. Every
 * staff member was signed out by a page reload.
 */

import { describe, expect, it } from "vitest";

import { loginSchema, refreshSchema } from "./auth.validation.js";

describe("refreshSchema", () => {
  it("accepts a request with NO body at all", () => {
    // Express 5 hands the validator `undefined`, not `{}`, when a request
    // carries no body. This is the browser's normal call.
    const parsed = refreshSchema.parse(undefined);

    expect(parsed).toEqual({});
    expect(parsed.refreshToken).toBeUndefined();
  });

  it("accepts an empty body", () => {
    expect(refreshSchema.parse({})).toEqual({});
  });

  it("still accepts a token in the body, for non-browser clients", () => {
    // A mobile app or a server-to-server caller has no cookie jar and sends
    // the token explicitly.
    expect(refreshSchema.parse({ refreshToken: "a-token" })).toEqual({
      refreshToken: "a-token",
    });
  });

  it("rejects an empty-string token rather than treating it as absent", () => {
    expect(() => refreshSchema.parse({ refreshToken: "" })).toThrow();
  });
});

describe("loginSchema", () => {
  it("accepts credentials and normalises the email", () => {
    const parsed = loginSchema.parse({
      email: "  Admin@Restaurant.Local ",
      password: "whatever",
    });

    // Emails are matched case-insensitively, so they are lowercased on the way
    // in — otherwise "Admin@" and "admin@" would be two different accounts.
    expect(parsed.email).toBe("admin@restaurant.local");
  });

  it("requires both fields", () => {
    // Unlike refresh, login genuinely needs a body — the default must not have
    // leaked across to it.
    expect(() => loginSchema.parse(undefined)).toThrow();
    expect(() => loginSchema.parse({ email: "a@b.com" })).toThrow();
    expect(() => loginSchema.parse({ password: "x" })).toThrow();
  });

  it("rejects a malformed email", () => {
    expect(() => loginSchema.parse({ email: "not-an-email", password: "x" })).toThrow();
  });
});
