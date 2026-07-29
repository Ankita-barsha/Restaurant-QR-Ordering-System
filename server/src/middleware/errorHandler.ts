import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { prismaErrorToAppError } from "../utils/prismaError.js";
import { isMulterError, multerErrorToAppError } from "./upload.js";

/** Shape returned for every failed request, without exception. */
interface ErrorResponse {
  success: false;
  message: string;
  details?: unknown;
  stack?: string;
}

/**
 * Catches requests that matched no route. Express reaches this only when
 * nothing above it responded, so it must be registered AFTER all routes.
 */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * The single exit point for every error in the application.
 *
 * Express identifies error middleware by ARITY: it must declare exactly four
 * parameters. Removing `next` silently turns this into ordinary middleware
 * that never runs, so it is kept and prefixed with `_`.
 *
 * Must be registered LAST, after all routes and the 404 handler.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let statusCode = 500;
  let message = "Something went wrong";
  let details: unknown;

  /**
   * Errors thrown by libraries carry their own types. Each is translated to an
   * AppError here so the switch below only ever deals with one shape.
   *
   * Both of these represent CLIENT mistakes — an oversized upload, a duplicate
   * email — and must not surface as 500s. Prisma in particular throws for every
   * constraint violation, and treating those as server faults told the caller
   * to retry a request that could never succeed.
   */
  const normalised = isMulterError(err)
    ? multerErrorToAppError(err)
    : (prismaErrorToAppError(err) ?? err);

  if (normalised instanceof ZodError) {
    // Validation failure — report which fields failed and why.
    statusCode = 400;
    message = "Validation failed";
    details = normalised.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
  } else if (normalised instanceof AppError) {
    statusCode = normalised.statusCode;
    message = normalised.message;
    details = normalised.details;
  }
  // Anything else is an unknown/programmer error: the 500 defaults above stand
  // deliberately, so internal messages never reach the client.

  const isServerError = statusCode >= 500;

  // Log server errors in full with structured metadata; client errors log lightweight warnings.
  const logPayload = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    statusCode,
    message,
    ...(isServerError && err instanceof Error ? { stack: err.stack } : {}),
  };

  if (isServerError) {
    console.error(`[ERROR_TRACKER] Server Failure:`, JSON.stringify(logPayload));
  } else if (statusCode === 401 || statusCode === 403) {
    console.warn(`[SECURITY_EVENT] Authorization Warning:`, JSON.stringify(logPayload));
  }

  const body: ErrorResponse = { success: false, message };

  if (details !== undefined) {
    body.details = details;
  }

  // Stack traces are a disclosure risk: they reveal file paths, dependency
  // versions and code structure. Development only.
  if (config.isDevelopment && err instanceof Error) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};
