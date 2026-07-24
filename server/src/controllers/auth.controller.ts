/**
 * Auth controllers.
 *
 * Controllers are thin by design: read the request, call a service, shape the
 * response. No business rules, no Prisma calls. If a controller starts making
 * decisions, that logic belongs in the service.
 *
 * Note the absence of try/catch. Express 5 forwards rejected promises to the
 * error middleware automatically, so throwing is the correct way to fail.
 */

import type { CookieOptions, Request, RequestHandler, Response } from "express";

import { config } from "../config/env.js";
import * as authService from "../services/auth.service.js";
import { AppError } from "../utils/AppError.js";
import { durationToMs } from "../utils/jwt.js";

/** Cookie name for the refresh token. */
const REFRESH_COOKIE = "refreshToken";

/**
 * Refresh tokens are sent as an httpOnly cookie rather than returned in the
 * body for the browser to store.
 *
 *   httpOnly  — JavaScript cannot read it, so an XSS payload cannot steal the
 *               session. This is the property localStorage cannot provide.
 *   sameSite  — 'lax' blocks the cookie on cross-site POSTs, mitigating CSRF.
 *   secure    — HTTPS only. Disabled in development, where there is no TLS.
 *   path      — scoped to the refresh endpoint, so it is not attached to every
 *               request and cannot leak from unrelated handlers.
 *
 * The short-lived ACCESS token still goes in the response body: the client
 * must attach it to the Authorization header, which requires reading it.
 */
const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: "lax",
  path: "/api/auth",
  maxAge: durationToMs(config.jwt.refreshExpiresIn),
});

/** Collects request metadata stored against the session. */
const sessionContext = (req: Request) => ({
  userAgent: req.get("user-agent"),
  ipAddress: req.ip,
});

/** Reads the refresh token from the cookie, falling back to the body. */
const readRefreshToken = (req: Request): string => {
  const fromCookie = (req.cookies as Record<string, string> | undefined)?.[
    REFRESH_COOKIE
  ];
  const fromBody = (req.body as { refreshToken?: string } | undefined)
    ?.refreshToken;

  const token = fromCookie ?? fromBody;

  if (!token) {
    throw AppError.unauthorized("Refresh token is required");
  }

  return token;
};

const sendRefreshCookie = (res: Response, token: string): void => {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
};

/** POST /api/auth/login */
export const login: RequestHandler = async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const { user, tokens } = await authService.login(
    email,
    password,
    sessionContext(req)
  );

  sendRefreshCookie(res, tokens.refreshToken);

  res.json({
    success: true,
    message: "Logged in successfully",
    data: { user, accessToken: tokens.accessToken },
  });
};

/** POST /api/auth/refresh */
export const refresh: RequestHandler = async (req, res) => {
  const token = readRefreshToken(req);

  const tokens = await authService.refresh(token, sessionContext(req));

  sendRefreshCookie(res, tokens.refreshToken);

  res.json({
    success: true,
    message: "Token refreshed",
    data: { accessToken: tokens.accessToken },
  });
};

/** POST /api/auth/logout */
export const logout: RequestHandler = async (req, res) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[
    REFRESH_COOKIE
  ];

  if (token) {
    await authService.logout(token);
  }

  // Cleared with the same options it was set with, or the browser keeps it.
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });

  res.json({ success: true, message: "Logged out successfully" });
};

/** POST /api/auth/logout-all — ends every session for the current user. */
export const logoutAll: RequestHandler = async (req, res) => {
  // authenticate guarantees req.user; this satisfies the type checker.
  const userId = req.user!.sub;

  const revoked = await authService.logoutAll(userId);

  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });

  res.json({
    success: true,
    message: `Signed out of ${revoked} session(s)`,
  });
};

/** GET /api/auth/me */
export const me: RequestHandler = async (req, res) => {
  const user = await authService.getCurrentUser(req.user!.sub);

  res.json({ success: true, data: { user } });
};
