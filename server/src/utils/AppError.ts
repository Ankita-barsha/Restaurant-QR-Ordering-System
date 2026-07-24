/**
 * Application error.
 *
 * Represents an OPERATIONAL error: an expected failure that is part of normal
 * operation (bad input, missing resource, wrong credentials). Its message is
 * safe to send to the client.
 *
 * Anything thrown that is NOT an AppError is treated as a programmer error:
 * logged in full, reported to the client as a generic 500.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  /** Marks this as a known, safe-to-expose failure. */
  public readonly isOperational: boolean = true;

  /** Optional structured context, e.g. per-field validation messages. */
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);

    // Restores the prototype chain: without this, `instanceof AppError` fails
    // when targeting ES5-era output, because Error is a built-in.
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = new.target.name;
    this.statusCode = statusCode;
    this.details = details;

    // Omits this constructor from the stack trace, so the trace points at the
    // line that actually threw.
    Error.captureStackTrace(this, this.constructor);
  }

  /** 400 — the request itself is malformed or fails validation. */
  static badRequest(message = "Bad request", details?: unknown): AppError {
    return new AppError(message, 400, details);
  }

  /** 401 — not authenticated: no credentials, or invalid ones. */
  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(message, 401);
  }

  /** 403 — authenticated, but not permitted. Used by RBAC in Step 5. */
  static forbidden(message = "You do not have permission to do this"): AppError {
    return new AppError(message, 403);
  }

  /** 404 — the resource does not exist. */
  static notFound(message = "Resource not found"): AppError {
    return new AppError(message, 404);
  }

  /**
   * 409 — conflicts with current state, e.g. duplicate email or a fully
   * booked time slot.
   *
   * Takes optional details so a refusal can carry something actionable —
   * a fully booked reservation returns the nearby times that ARE free,
   * rather than leaving the guest at a dead end.
   */
  static conflict(
    message = "Resource already exists",
    details?: unknown
  ): AppError {
    return new AppError(message, 409, details);
  }
}
