/**
 * Express type augmentation.
 *
 * `authenticate` attaches the caller to `req.user`. Without this declaration
 * TypeScript rejects that property, and the usual workarounds — casting to
 * `any` or inventing an `AuthedRequest` type — either discard type safety or
 * fail to match the RequestHandler signature Express expects.
 *
 * Declaration merging extends Express' own interface instead, so `req.user` is
 * typed everywhere with no casts at call sites.
 */

import type { AccessTokenPayload } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. Undefined on public routes. */
      user?: AccessTokenPayload;
    }
  }
}

export {};
