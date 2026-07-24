/**
 * Audit middleware.
 *
 * Records a mutation AFTER it succeeds, by hooking res.json rather than
 * running before the handler. Logging up front would record attempts that
 * were then rejected by validation or a business rule, filling the trail with
 * events that never happened.
 */

import type { RequestHandler } from "express";

import { recordAudit } from "../services/audit.service.js";

interface AuditOptions {
  /** Dotted verb, e.g. "food.update". */
  action: string;
  /** Model name the action targets. */
  entity: string;
  /** Pulls the affected record's id out of the response body. */
  entityIdFrom?: (body: unknown) => string | undefined;
}

/** Default extractor: most handlers respond with { data: { id } }. */
const defaultEntityId = (body: unknown): string | undefined => {
  const data = (body as { data?: { id?: string } } | undefined)?.data;

  return typeof data?.id === "string" ? data.id : undefined;
};

/**
 * Audits a successful mutation.
 *
 * Mount after `authenticate` so req.user is populated.
 */
export const audit = (options: AuditOptions): RequestHandler => {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      // Only successful responses are audited. A 4xx means the action was
      // refused, so there is nothing to record.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const extractId = options.entityIdFrom ?? defaultEntityId;

        // Express types params as string | string[] because wildcard routes
        // can repeat a key; audited routes always use a single :id.
        const paramId =
          typeof req.params.id === "string" ? req.params.id : undefined;

        // Not awaited: the response must not wait on the audit write, and
        // recordAudit never rejects.
        void recordAudit({
          action: options.action,
          entity: options.entity,
          entityId: extractId(body) ?? paramId,
          after: (body as { data?: unknown } | undefined)?.data,
          actorId: req.user?.sub,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });
      }

      return originalJson(body);
    };

    next();
  };
};
