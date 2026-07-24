/**
 * JSON Web Token issuing and verification.
 *
 * Two token types with different jobs:
 *
 *   ACCESS  — short-lived (15m), sent with every request. Stateless: verified
 *             by signature alone, no database round-trip. That speed is the
 *             whole point, and it is why it must expire quickly: there is no
 *             way to revoke one before it expires.
 *
 *   REFRESH — long-lived (7d), sent only to /auth/refresh to mint a new access
 *             token. Its hash is stored in the database, so it CAN be revoked.
 *
 * The pair buys both properties: fast stateless checks on the hot path, and
 * genuine session revocation on the cold path.
 */

import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import { config } from "../config/env.js";
import { AppError } from "./AppError.js";

/** Claims embedded in an access token. */
export interface AccessTokenPayload {
  /** User id. `sub` is the registered JWT claim for the subject. */
  sub: string;
  email: string;
  roleId: string;
  roleName: string;
  /**
   * Permission keys, denormalised into the token so authorisation needs no
   * database query. Trade-off: a permission change does not take effect until
   * the access token expires (max 15 minutes). Acceptable for admin tooling;
   * revoke the refresh token to force an immediate re-login.
   */
  permissions: string[];
}

/** Claims embedded in a refresh token — deliberately minimal. */
export interface RefreshTokenPayload {
  sub: string;
  /** Unique id per issued token, matched against the database record. */
  jti: string;
}

export const signAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresIn,
  } as jwt.SignOptions);
};

export const signRefreshToken = (payload: RefreshTokenPayload): string => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as jwt.SignOptions);
};

/**
 * Verifies an access token's signature and expiry.
 *
 * Any failure is reported as a generic 401. Distinguishing "malformed" from
 * "expired" from "wrong signature" in the response would help an attacker
 * probe the system.
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    return jwt.verify(token, config.jwt.secret) as AccessTokenPayload;
  } catch {
    throw AppError.unauthorized("Invalid or expired token");
  }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
  } catch {
    throw AppError.unauthorized("Invalid or expired refresh token");
  }
};

/**
 * Hashes a refresh token for storage.
 *
 * SHA-256 rather than bcrypt: unlike a password, this input is already high
 * entropy (a signed JWT), so it is not brute-forceable and needs no slow
 * hash. It is also looked up on every refresh, where bcrypt's cost would be
 * pure latency. What matters is that the raw token is never at rest.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/** Converts "15m" / "7d" style durations to milliseconds. */
export const durationToMs = (duration: string): number => {
  const match = /^(\d+)([smhd])$/.exec(duration);

  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";

  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

  return value * multipliers[unit];
};
