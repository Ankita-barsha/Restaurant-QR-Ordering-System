/**
 * Writes the OpenAPI document to disk: `npm run docs`.
 *
 * The served spec at /api/docs/openapi.json is the live one. This produces a
 * committed copy for the things that want a FILE rather than a URL — importing
 * into Postman, generating a typed client, diffing the contract in review, or
 * publishing the docs without running the server.
 *
 * Because the spec is derived from the validation schemas, a stale checked-in
 * file is a visible diff rather than a silent lie: re-run this and the change
 * shows up in the pull request alongside the code that caused it.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { openApiDocument, openApiJson } from "./openapi.js";

const target = resolve(process.cwd(), "openapi.json");

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${openApiJson}\n`, "utf8");

const operations = Object.values(openApiDocument.paths).reduce(
  (total, methods) => total + Object.keys(methods).length,
  0
);

console.log(
  `Wrote ${target}\n  ${Object.keys(openApiDocument.paths).length} paths, ${operations} operations`
);
