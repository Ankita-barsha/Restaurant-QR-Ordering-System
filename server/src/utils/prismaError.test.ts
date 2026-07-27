/**
 * Prisma error translation.
 *
 * The point of these is the STATUS CODE. Before this mapping existed, every
 * constraint violation reached the client as a 500 "Something went wrong",
 * which told the caller to retry a request that could never succeed and told
 * the operator to go looking for a server fault that was not there.
 */

import { describe, expect, it } from "vitest";

import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "./AppError.js";
import { prismaErrorToAppError } from "./prismaError.js";

const knownError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("prisma internal message", {
    code,
    clientVersion: "7.9.0",
    meta,
  });

describe("prismaErrorToAppError", () => {
  it("maps a unique constraint to 409 and names the field", () => {
    const mapped = prismaErrorToAppError(knownError("P2002", { target: ["email"] }));

    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped?.statusCode).toBe(409);
    expect(mapped?.message).toContain("email");
  });

  it("names every field of a composite unique constraint", () => {
    const mapped = prismaErrorToAppError(
      knownError("P2002", { target: ["roleId", "permissionId"] })
    );

    expect(mapped?.message).toContain("roleId and permissionId");
  });

  it("still produces a usable message when Prisma reports no target", () => {
    const mapped = prismaErrorToAppError(knownError("P2002"));

    expect(mapped?.statusCode).toBe(409);
    expect(mapped?.message).toBe("That value is already taken");
  });

  it("maps a missing record to 404", () => {
    for (const code of ["P2001", "P2015", "P2018", "P2025"]) {
      expect(prismaErrorToAppError(knownError(code))?.statusCode).toBe(404);
    }
  });

  it("maps bad input to 400", () => {
    for (const code of ["P2000", "P2011", "P2012", "P2013", "P2005", "P2006", "P2007"]) {
      expect(prismaErrorToAppError(knownError(code))?.statusCode).toBe(400);
    }
  });

  it("maps relation conflicts to 409", () => {
    for (const code of ["P2003", "P2014"]) {
      expect(prismaErrorToAppError(knownError(code))?.statusCode).toBe(409);
    }
  });

  it("maps a write conflict to 409, because retrying WILL work", () => {
    const mapped = prismaErrorToAppError(knownError("P2034"));

    expect(mapped?.statusCode).toBe(409);
    expect(mapped?.message).toMatch(/try again/i);
  });

  it("maps a malformed query to 400", () => {
    const error = new Prisma.PrismaClientValidationError("invalid query", {
      clientVersion: "7.9.0",
    });

    expect(prismaErrorToAppError(error)?.statusCode).toBe(400);
  });

  it("maps an unreachable database to 503", () => {
    const error = new Prisma.PrismaClientInitializationError(
      "cannot reach database",
      "7.9.0"
    );

    expect(prismaErrorToAppError(error)?.statusCode).toBe(503);
  });

  it("never leaks Prisma's own message to the client", () => {
    // Prisma's text quotes table and column names, and sometimes the offending
    // value. None of that is the caller's business.
    const mapped = prismaErrorToAppError(knownError("P2002", { target: ["email"] }));

    expect(mapped?.message).not.toContain("prisma internal message");
  });

  it("returns null for an unrecognised Prisma code, so it stays a 500", () => {
    // Deliberate: a code the mapping does not know about is something the
    // application did not anticipate, which is a bug to investigate rather
    // than a message to dress up.
    expect(prismaErrorToAppError(knownError("P2099"))).toBeNull();
  });

  it("returns null for errors that did not come from Prisma", () => {
    expect(prismaErrorToAppError(new Error("boom"))).toBeNull();
    expect(prismaErrorToAppError(AppError.notFound())).toBeNull();
    expect(prismaErrorToAppError("a string")).toBeNull();
  });
});
