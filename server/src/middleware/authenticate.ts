/**
 * Authentication middleware — answers "who is this?"
 *
 * Distinct from authorisation ("may they do this?"), which lives in
 * authorize.ts. Keeping them separate means a route can require a login
 * without requiring a specific permission.
 */

import type { RequestHandler } from "express";

import { AppError } from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

/**
 * Extracts a bearer token from the Authorization header.
 * Expected form: `Authorization: Bearer <token>`
 */
const extractToken = (header: string | undefined): string | null => {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token.length > 0 ? token : null;
};

/**
 * Requires a valid access token. Rejects with 401 otherwise.
 *
 * Verification is signature-only — no database lookup — which is what makes
 * this cheap enough to run on every request.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    throw AppError.unauthorized("Authentication required");
  }

  // Throws a 401 AppError on any failure; Express 5 forwards it to the
  // error handler automatically.
  req.user = verifyAccessToken(token);

  next();
};

/**
 * Attaches the user when a valid token is present, but allows the request
 * through when it is not.
 *
 * Needed for endpoints that serve both audiences — a customer browsing the
 * menu anonymously and a logged-in staff member who should additionally see
 * unavailable items.
 */
export const optionalAuthenticate: RequestHandler = (req, _res, next) => {
  const token = extractToken(req.headers.authorization);

  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // A bad token on an optional route is treated as anonymous rather than
      // an error, so an expired session never breaks public browsing.
    }
  }

  next();
};
