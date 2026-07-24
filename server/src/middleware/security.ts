/**
 * Production security middleware.
 *
 * These matter far more once the app is on the public internet than on
 * localhost: a login endpoint reachable from anywhere will be probed by
 * automated credential-stuffing traffic within hours of going live.
 */

import type { RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";

import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

/**
 * Security headers.
 *
 * crossOriginResourcePolicy is relaxed to "cross-origin" because the API
 * serves uploaded food images to a client on a DIFFERENT origin. The default
 * ("same-origin") would make every menu photo fail to load in production
 * while working perfectly in development, which is a miserable bug to chase.
 */
export const securityHeaders: RequestHandler = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // The API returns JSON and images, never HTML, so a CSP here protects
  // nothing and only risks blocking the image responses.
  contentSecurityPolicy: false,
});

/**
 * General API rate limit.
 *
 * Generous, because a busy restaurant's kitchen display polls and several
 * staff share one office IP. This is a runaway-client backstop, not the
 * brute-force defence — that is authLimiter below.
 */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Skipped in development so testing does not trip the limit.
  skip: () => config.isDevelopment,
  handler: () => {
    throw new AppError("Too many requests. Please slow down.", 429);
  },
});

/**
 * Login and refresh limiter.
 *
 * Strict: 10 attempts per 15 minutes per IP+email pair. Keyed on the EMAIL as
 * well as the IP so one attacker cannot lock out every user behind a shared
 * NAT, and so trying many passwords against one account is what gets blocked.
 *
 * Failed attempts only — a staff member signing in correctly all day is never
 * penalised.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => config.isDevelopment,
  keyGenerator: (req) => {
    const email = (req.body as { email?: string } | undefined)?.email ?? "";

    // ipKeyGenerator normalises IPv6 addresses to a /56 subnet, so an
    // attacker cannot simply rotate through addresses in their own block.
    return `${ipKeyGenerator(req.ip ?? "")}:${email.toLowerCase()}`;
  },
  handler: () => {
    throw new AppError(
      "Too many sign-in attempts. Please try again in 15 minutes.",
      429
    );
  },
});
