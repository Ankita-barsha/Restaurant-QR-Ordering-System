/**
 * Translates Prisma errors into AppErrors.
 *
 * Without this, every constraint violation reaches the error handler as an
 * unrecognised throw and is reported as a 500 "Something went wrong". That is
 * wrong twice over: a duplicate email is the CLIENT's mistake, not a server
 * fault, and a 500 tells the caller to retry something that will never succeed.
 *
 * Messages are written for the person using the app, never copied from Prisma.
 * Prisma's own text quotes table names, column names and sometimes the offending
 * value, all of which are internal detail the client has no business seeing.
 */

import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "./AppError.js";

/** Reads the `target` field Prisma attaches to constraint errors. */
const constraintFields = (meta: unknown): string[] => {
  const target = (meta as { target?: unknown } | undefined)?.target;

  if (Array.isArray(target)) {
    return target.filter((field): field is string => typeof field === "string");
  }

  // Some connectors report the constraint NAME as a single string.
  return typeof target === "string" ? [target] : [];
};

/**
 * Turns ["email"] into "email", ["roleId", "permissionId"] into
 * "roleId and permissionId" — readable in a sentence.
 */
const listFields = (fields: string[]): string =>
  fields.length > 1
    ? `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1]}`
    : fields[0];

/**
 * Maps a known Prisma request error to the status it actually deserves.
 *
 * Only the codes this application can realistically produce are listed. An
 * unlisted code falls through to a 500, which is correct: it means something
 * happened that the code does not understand, and that is a bug to investigate
 * rather than a message to dress up for the client.
 */
const fromKnownRequestError = (
  error: Prisma.PrismaClientKnownRequestError
): AppError | null => {
  switch (error.code) {
    // Unique constraint. The single most common one: a duplicate email,
    // table number, slug or receipt number.
    case "P2002": {
      const fields = constraintFields(error.meta);

      return AppError.conflict(
        fields.length > 0
          ? `Another record already uses this ${listFields(fields)}`
          : "That value is already taken"
      );
    }

    // Foreign key constraint — the referenced row is missing, or a Restrict
    // relation refuses the delete (a category that still holds dishes).
    case "P2003":
      return AppError.conflict(
        "That change conflicts with related records and was not applied"
      );

    // Deleting a row other rows still require.
    case "P2014":
      return AppError.conflict(
        "That record is still referenced elsewhere and cannot be removed"
      );

    // The row an update/delete targeted does not exist.
    case "P2001":
    case "P2015":
    case "P2018":
    case "P2025":
      return AppError.notFound("Record not found");

    // Value too long for the column, e.g. an oversized note.
    case "P2000":
      return AppError.badRequest("One of the values supplied is too long");

    // NOT NULL violation, or a required field left out.
    case "P2011":
    case "P2012":
    case "P2013":
      return AppError.badRequest("A required field is missing");

    // Malformed value for the column type.
    case "P2005":
    case "P2006":
    case "P2007":
      return AppError.badRequest("One of the values supplied is not valid");

    // Serialisation failure: two transactions touched the same rows. Retrying
    // usually succeeds, so 409 (not 500) tells the caller exactly that.
    case "P2034":
      return AppError.conflict(
        "That action collided with another change. Please try again."
      );

    default:
      return null;
  }
};

/**
 * Converts any Prisma error into an AppError, or returns null when the error
 * did not come from Prisma at all.
 */
export const prismaErrorToAppError = (error: unknown): AppError | null => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return fromKnownRequestError(error);
  }

  /**
   * A malformed query. This is a programming mistake, so the detail is logged
   * rather than returned — but it is still a 400 rather than a 500 when it is
   * reached through user input Zod did not narrow (an unknown filter value,
   * for instance).
   */
  if (error instanceof Prisma.PrismaClientValidationError) {
    return AppError.badRequest("The request could not be processed as sent");
  }

  // Database unreachable at startup or mid-request. 503, because the client
  // should retry later; the request itself was fine.
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return new AppError("The service is temporarily unavailable", 503);
  }

  return null;
};
