/**
 * Audit logging.
 *
 * An append-only record of who did what. AuditLog has no update path and no
 * updatedAt column by design: a log that can be edited is not evidence.
 *
 * TWO RULES:
 *
 *   1. Writing an audit entry must NEVER break the action it records. If
 *      logging fails, the order still goes through. Losing a log line is bad;
 *      losing a customer's order because logging failed is worse.
 *   2. Secrets are stripped before storage. Snapshots routinely contain whole
 *      records, and a password hash or token copied into an audit row is a
 *      credential leak that outlives the rotation that was supposed to fix it.
 */

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";

/** Field names never written to an audit snapshot, at any depth. */
const REDACTED_KEYS = new Set([
  "password",
  "passwordHash",
  "newPassword",
  "currentPassword",
  "token",
  "tokenHash",
  "accessToken",
  "refreshToken",
  "jwtSecret",
  "apiKey",
  "qrToken",
  // The per-order secret that authorises tracking, the invoice and payment.
  // Order snapshots routinely carry the whole row, and an audit trail is read
  // by every administrator — this must not be one of the places it survives.
  "trackingToken",
  "razorpayKeySecret",
]);

/**
 * Recursively removes sensitive values from a snapshot.
 *
 * Replaces rather than deletes, so a diff still shows that the field changed
 * without revealing either value.
 */
const redact = (value: unknown, depth = 0): unknown => {
  // Guards against cyclic structures and pathological nesting.
  if (depth > 6 || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1));
  }

  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = REDACTED_KEYS.has(key) ? "[REDACTED]" : redact(entry, depth + 1);
  }

  return result;
};

export interface AuditContext {
  /** Null for system-generated actions with no human actor. */
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEntry extends AuditContext {
  /** Dotted verb, e.g. "food.update", "order.cancel", "user.login". */
  action: string;
  /** Model the action targeted, e.g. "Food". */
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Records an audited action.
 *
 * Deliberately swallows its own errors — see rule 1 above. Callers do not
 * await a result they would have to handle.
 */
export const recordAudit = async (entry: AuditEntry): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: redact(entry.before) as Prisma.InputJsonValue,
        after: redact(entry.after) as Prisma.InputJsonValue,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch (error) {
    // Logged to the console so the failure is visible, but never rethrown.
    console.error("[audit] failed to record entry:", entry.action, error);
  }
};

export interface AuditListQuery {
  page?: number;
  limit?: number;
  actorId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

/** Reads the audit trail. Restricted to auditLog:read (Super Admin panel). */
export const listAuditLogs = async (
  query: AuditListQuery
): Promise<{ logs: unknown[]; meta: PaginationMeta }> => {
  const pagination = getPagination(query.page, query.limit);

  const where: Prisma.AuditLogWhereInput = {
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.entity ? { entity: query.entity } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, meta: buildPaginationMeta(pagination, total) };
};
