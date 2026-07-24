/**
 * Request validation middleware.
 *
 * Applies the "parse, don't validate" rule from the config layer to incoming
 * HTTP data. Everything on the wire is untrusted and untyped; this is the
 * boundary where it becomes typed and safe.
 *
 * Controllers downstream can then treat req.body as valid without defensive
 * checks, because an invalid request never reaches them.
 */

import type { RequestHandler } from "express";
import type { ZodType } from "zod";

interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Validates the named parts of a request against Zod schemas.
 *
 * Parsed output replaces the raw input, so downstream handlers receive
 * coerced values (numbers as numbers) and stripped unknown keys — which also
 * blocks mass-assignment, where a client posts `roleId` to an endpoint that
 * never intended to accept it.
 *
 * A ZodError thrown here is caught by the central error handler and rendered
 * as a 400 with per-field details.
 */
export const validate = (schemas: ValidationSchemas): RequestHandler => {
  return (req, _res, next) => {
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }

    if (schemas.params) {
      // req.params is a plain property assigned by the router, so mutating it
      // in place is safe and keeps `req.params.id` working as normal.
      Object.assign(req.params, schemas.params.parse(req.params));
    }

    if (schemas.query) {
      /**
       * req.query CANNOT be updated in place.
       *
       * Express 5 redefined it as a getter that re-parses the query string on
       * every access, so both assignment and mutation are silently discarded
       * and the controller would still receive raw strings — meaning
       * `?isVegetarian=true` reaches Prisma as the string "true" and throws.
       *
       * The parsed result is exposed as req.validatedQuery instead.
       */
      req.validatedQuery = schemas.query.parse(req.query);
    }

    next();
  };
};
