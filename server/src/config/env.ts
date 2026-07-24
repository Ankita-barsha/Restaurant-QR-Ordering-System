/**
 * Environment configuration.
 *
 * This is the ONLY module in the codebase that reads `process.env`.
 * Everything else imports the typed `config` object exported below.
 *
 * Validation runs at module load, so an invalid environment crashes the
 * process at startup rather than surfacing as an undefined value later.
 */

// Side-effect import: loads .env into process.env before this module's body
// runs. It must stay first — see the note on import hoisting in README/docs.
import "dotenv/config";

import { z } from "zod";

/**
 * The contract between this service and its environment.
 * Adding a variable here is the single edit required to make it available,
 * validated, and typed across the whole codebase.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // process.env values are always strings; coerce turns "5000" into 5000.
  PORT: z.coerce
    .number({ error: "PORT must be a number" })
    .int("PORT must be an integer")
    .positive("PORT must be greater than 0")
    .default(5000),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .startsWith("postgres", "DATABASE_URL must be a PostgreSQL connection string"),

  // 32 chars is the practical floor for a signing key with meaningful entropy.
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Report every problem at once, not just the first, so a misconfigured
  // deployment can be fixed in a single pass.
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  console.error(`\n Invalid environment configuration:\n${details}\n`);
  process.exit(1);
}

const env = parsed.data;

/**
 * Typed, immutable application configuration.
 *
 * Grouped by concern rather than mirroring the flat .env file, so call sites
 * read as `config.jwt.secret` instead of `config.JWT_SECRET`.
 */
export const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isDevelopment: env.NODE_ENV === "development",
  port: env.PORT,

  database: Object.freeze({
    url: env.DATABASE_URL,
  }),

  jwt: Object.freeze({
    secret: env.JWT_SECRET,
  }),
});

export type Config = typeof config;
