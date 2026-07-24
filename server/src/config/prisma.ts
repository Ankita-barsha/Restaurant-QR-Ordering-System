/**
 * Prisma Client singleton.
 *
 * Exports ONE client for the entire process. Every service imports this
 * instance; nothing else may call `new PrismaClient()`.
 */

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "./env.js";

/**
 * Prisma 7 requires an explicit driver adapter for SQL databases. The adapter
 * owns a `pg` connection pool, so it is created once alongside the client.
 */
const createPrismaClient = (): PrismaClient => {
  const adapter = new PrismaPg({ connectionString: config.database.url });

  return new PrismaClient({
    adapter,
    // Query logging in development makes the SQL Prisma generates visible.
    // Drop "query" from this list if the output becomes noisy.
    log: config.isDevelopment
      ? ["query", "warn", "error"]
      : ["warn", "error"],
  });
};

/**
 * `tsx watch` re-executes modules on every file save. Without this cache each
 * reload would construct another PrismaClient and another connection pool,
 * exhausting Postgres' connection limit after a few dozen saves. Values
 * attached to globalThis survive module re-evaluation.
 *
 * Production runs the process once, so the cache is skipped there.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (!config.isProduction) {
  globalForPrisma.prisma = prisma;
}

/**
 * Verifies the database is reachable. Called at startup so a bad connection
 * fails immediately and visibly, rather than on the first customer request.
 */
export const connectDatabase = async (): Promise<void> => {
  await prisma.$connect();
};

/** Releases the connection pool during graceful shutdown. */
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};
