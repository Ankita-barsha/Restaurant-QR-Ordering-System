/**
 * Authentication business logic.
 *
 * Services own the rules and the database work. Controllers only translate
 * HTTP to service calls and back. That split is what lets the same logic be
 * reused by a Socket.io handler or a CLI script later, and what keeps these
 * rules unit-testable without spinning up Express.
 *
 * Note there is no `req` or `res` anywhere in this file — that is the test.
 */

import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  durationToMs,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from "../utils/jwt.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { config } from "../config/env.js";

interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: { id: string; name: string };
  permissions: string[];
}

/** Loads a user with the role and permission keys needed for a token. */
const findUserWithPermissions = async (userId: string) => {
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });
};

type UserWithRole = NonNullable<Awaited<ReturnType<typeof findUserWithPermissions>>>;

const toAuthenticatedUser = (user: UserWithRole): AuthenticatedUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: { id: user.role.id, name: user.role.name },
  permissions: user.role.permissions.map((rp) => rp.permission.key),
});

/**
 * Issues an access/refresh pair and records the refresh token.
 *
 * Only the SHA-256 hash is stored, so a database dump yields no usable
 * sessions.
 */
const issueTokens = async (
  user: UserWithRole,
  context: SessionContext
): Promise<AuthTokens> => {
  const authUser = toAuthenticatedUser(user);

  const payload: AccessTokenPayload = {
    sub: authUser.id,
    email: authUser.email,
    roleId: authUser.role.id,
    roleName: authUser.role.name,
    permissions: authUser.permissions,
  };

  const accessToken = signAccessToken(payload);

  // The database row is created first so its id can be embedded as the token's
  // jti, tying the signed token to exactly one revocable record.
  const record = await prisma.refreshToken.create({
    data: {
      // Replaced immediately below; the row must exist to have an id.
      tokenHash: `pending:${crypto.randomUUID()}`,
      userId: user.id,
      expiresAt: new Date(Date.now() + durationToMs(config.jwt.refreshExpiresIn)),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    },
  });

  const refreshToken = signRefreshToken({ sub: user.id, jti: record.id });

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { tokenHash: hashToken(refreshToken) },
  });

  return { accessToken, refreshToken };
};

/**
 * Verifies credentials and starts a session.
 *
 * Both the "no such user" and "wrong password" paths return the SAME error.
 * Distinguishing them turns the login form into an account enumeration oracle:
 * an attacker learns which email addresses are registered, which is valuable
 * on its own and narrows a credential-stuffing attack.
 */
export const login = async (
  email: string,
  password: string,
  context: SessionContext
): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> => {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });

  if (!user) {
    // Hash a dummy value so a missing account takes about as long as a real
    // one. Returning instantly here would leak account existence via timing,
    // undoing the identical error message above.
    await hashPassword(password);
    throw AppError.unauthorized("Invalid email or password");
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw AppError.unauthorized("Invalid email or password");
  }

  // Checked after the password so a deactivated account cannot be identified
  // without valid credentials.
  if (!user.isActive) {
    throw AppError.forbidden("This account has been deactivated");
  }

  const tokens = await issueTokens(user, context);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return { user: toAuthenticatedUser(user), tokens };
};

/**
 * Exchanges a refresh token for a new pair, rotating the old one.
 *
 * Rotation matters: each refresh invalidates the token that was used. If an
 * attacker steals a refresh token and the legitimate user refreshes first,
 * the stolen copy is already dead.
 */
export const refresh = async (
  token: string,
  context: SessionContext
): Promise<AuthTokens> => {
  const payload = verifyRefreshToken(token);

  const stored = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
  });

  // Signature alone is not enough — the token must still exist, match, be
  // unrevoked and unexpired. This is the check a stateless design cannot make.
  if (
    !stored ||
    stored.revokedAt !== null ||
    stored.expiresAt < new Date() ||
    stored.tokenHash !== hashToken(token)
  ) {
    throw AppError.unauthorized("Invalid or expired refresh token");
  }

  const user = await findUserWithPermissions(payload.sub);

  if (!user || !user.isActive) {
    throw AppError.unauthorized("Account is no longer active");
  }

  // Revoke before issuing, so a crash mid-way cannot leave two live tokens.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(user, context);
};

/** Revokes a single refresh token (this device's session). */
export const logout = async (token: string): Promise<void> => {
  const tokenHash = hashToken(token);

  // updateMany, not update: an unknown token must not throw. Logout is
  // idempotent — the caller's goal is "this session is dead", and it is.
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

/** Revokes every active session for a user ("log out everywhere"). */
export const logoutAll = async (userId: string): Promise<number> => {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return result.count;
};

/** Returns the current user's profile for GET /auth/me. */
export const getCurrentUser = async (
  userId: string
): Promise<AuthenticatedUser> => {
  const user = await findUserWithPermissions(userId);

  if (!user) {
    throw AppError.notFound("User not found");
  }

  return toAuthenticatedUser(user);
};
