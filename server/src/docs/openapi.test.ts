/**
 * The documentation must describe the API that actually exists.
 *
 * The first test here is the one that earns its keep: it walks the real Express
 * routers and asserts that every registered route appears in the spec, and that
 * the spec invents nothing. Adding an endpoint without documenting it fails the
 * build, which is the only way hand-written prose stays true over time.
 *
 * The rest guard the qualities tooling depends on — unique operation ids,
 * resolvable $refs, declared tags — the sort of thing that does not break the
 * server but does break a generated client.
 */

import { describe, expect, it } from "vitest";
import type { Router } from "express";

import { openApiDocument } from "./openapi.js";

import adminRoutes from "../routes/admin.routes.js";
import authRoutes from "../routes/auth.routes.js";
import categoryRoutes from "../routes/category.routes.js";
import foodRoutes from "../routes/food.routes.js";
import notificationRoutes from "../routes/notification.routes.js";
import orderRoutes from "../routes/order.routes.js";
import paymentRoutes from "../routes/payment.routes.js";
import reservationRoutes from "../routes/reservation.routes.js";
import tableRoutes from "../routes/table.routes.js";

/** Where each feature router is mounted, mirroring routes/index.ts. */
const MOUNTS: [prefix: string, router: Router][] = [
  ["/auth", authRoutes],
  ["/admin", adminRoutes],
  ["/categories", categoryRoutes],
  ["/foods", foodRoutes],
  ["/orders", orderRoutes],
  ["/notifications", notificationRoutes],
  ["/payments", paymentRoutes],
  ["/reservations", reservationRoutes],
  ["/tables", tableRoutes],
];

/** Declared directly on the API router rather than in a feature router. */
const INLINE_ROUTES = ["get /health", "get /settings"];

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Express writes `:id`; OpenAPI writes `{id}`. */
const toTemplate = (path: string): string =>
  path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

/** Every "method path" pair the server actually serves under /api. */
const registeredRoutes = (): string[] => {
  const found: string[] = [...INLINE_ROUTES];

  for (const [prefix, router] of MOUNTS) {
    const stack = (router as unknown as { stack: RouterLayer[] }).stack;

    for (const layer of stack) {
      if (!layer.route) continue;

      // A router mounted at "/orders" with a route at "/" serves "/orders".
      const path = layer.route.path === "/" ? prefix : `${prefix}${layer.route.path}`;

      for (const method of Object.keys(layer.route.methods)) {
        found.push(`${method} ${toTemplate(path)}`);
      }
    }
  }

  return found;
};

/** Every "method path" pair the document describes. */
const documentedRoutes = (): string[] =>
  Object.entries(openApiDocument.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => `${method} ${path}`)
  );

describe("the spec matches the routes the server registers", () => {
  const registered = registeredRoutes();
  const documented = documentedRoutes();

  it("documents every registered route", () => {
    const missing = registered.filter((route) => !documented.includes(route));

    // Named individually so the failure says WHICH endpoint was forgotten.
    expect(missing, `Undocumented endpoints:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("documents no route that does not exist", () => {
    const phantom = documented.filter((route) => !registered.includes(route));

    expect(phantom, `Documented but not served:\n  ${phantom.join("\n  ")}`).toEqual([]);
  });

  it("covers the whole surface", () => {
    // A floor, so an accidental empty walk of the router stack cannot pass
    // both checks above by describing nothing at all.
    expect(registered.length).toBeGreaterThan(60);
    expect(documented.length).toBe(registered.length);
  });
});

describe("the document is well formed", () => {
  const operations = Object.values(openApiDocument.paths).flatMap((methods) =>
    Object.values(methods)
  ) as Record<string, unknown>[];

  it("gives every operation a unique operationId", () => {
    // Client generators name their methods after these; a duplicate silently
    // overwrites one endpoint with another.
    const ids = operations.map((operation) => operation.operationId as string);

    expect(ids.filter(Boolean)).toHaveLength(operations.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every operation a summary and a description", () => {
    for (const operation of operations) {
      expect(operation.summary, String(operation.operationId)).toBeTruthy();
      expect(operation.description, String(operation.operationId)).toBeTruthy();
    }
  });

  it("states the access rule on every operation", () => {
    // Who may call it is the first thing an integrator needs, so it is folded
    // into every description rather than left to the security block alone.
    for (const operation of operations) {
      expect(String(operation.description), String(operation.operationId)).toContain(
        "**Access:**"
      );
    }
  });

  it("only uses tags it declares", () => {
    const declared = new Set(openApiDocument.tags.map((tag) => tag.name));

    for (const operation of operations) {
      for (const tag of operation.tags as string[]) {
        expect(declared, `${String(operation.operationId)} uses tag "${tag}"`).toContain(tag);
      }
    }
  });

  it("only references security schemes it defines", () => {
    const defined = new Set(Object.keys(openApiDocument.components.securitySchemes));

    for (const operation of operations) {
      for (const requirement of (operation.security ?? []) as Record<string, unknown>[]) {
        for (const scheme of Object.keys(requirement)) {
          expect(defined, String(operation.operationId)).toContain(scheme);
        }
      }
    }
  });

  it("resolves every $ref", () => {
    const defined = new Set(Object.keys(openApiDocument.components.schemas));
    const refs = new Set<string>();

    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }

      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          if (key === "$ref" && typeof value === "string") {
            refs.add(value.replace("#/components/schemas/", ""));
          } else {
            walk(value);
          }
        }
      }
    };

    walk(openApiDocument.paths);

    for (const name of refs) {
      expect(defined, `$ref to missing schema "${name}"`).toContain(name);
    }
  });

  it("declares a 429 everywhere, because every /api route is rate limited", () => {
    for (const operation of operations) {
      const responses = operation.responses as Record<string, unknown>;

      expect(Object.keys(responses), String(operation.operationId)).toContain("429");
    }
  });
});
