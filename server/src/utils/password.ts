/**
 * Password hashing.
 *
 * bcrypt is deliberately SLOW. A fast hash (MD5, SHA-256) lets an attacker who
 * steals the database test billions of candidate passwords per second on a
 * GPU. bcrypt's cost factor makes each guess expensive, so a stolen hash is
 * far less useful.
 */

import bcrypt from "bcrypt";

import { config } from "../config/env.js";

/**
 * Hashes a plaintext password.
 *
 * bcrypt generates a random salt per password and embeds it in the output, so
 * two users with the same password get different hashes. That defeats rainbow
 * tables and stops an attacker seeing which accounts share a password.
 */
export const hashPassword = async (plainPassword: string): Promise<string> => {
  return bcrypt.hash(plainPassword, config.security.bcryptRounds);
};

/**
 * Verifies a plaintext password against a stored hash.
 *
 * NEVER compare with `===`. Two reasons:
 *   1. The salt is baked into the hash, so re-hashing the input yields a
 *      different string; only bcrypt.compare knows how to extract and reuse
 *      the original salt.
 *   2. `===` short-circuits on the first differing byte, leaking how much of
 *      the value matched via response timing. bcrypt.compare runs in constant
 *      time with respect to the content.
 */
export const verifyPassword = async (
  plainPassword: string,
  passwordHash: string
): Promise<boolean> => {
  return bcrypt.compare(plainPassword, passwordHash);
};
