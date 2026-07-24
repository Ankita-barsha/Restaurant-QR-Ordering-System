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

  /// Separate key for refresh tokens. Sharing one secret would let an access
  /// token be replayed as a refresh token, defeating the short access expiry.
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  // Short-lived: a stolen access token stays useful only for this long.
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  // Long-lived but revocable, because it is tracked in the database.
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  /**
   * bcrypt cost factor. Each increment doubles the work. 12 is the current
   * sensible default: slow enough to frustrate offline cracking, fast enough
   * (~200ms) not to stall a login request.
   */
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  /**
   * Browser origin allowed to call this API. A single explicit origin, not
   * "*", because credentialed requests (our refresh cookie) are rejected by
   * browsers when the origin is a wildcard.
   */
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),

  /**
   * Upload directory, resolved relative to the process working directory.
   * Kept outside src/ because tsc emits only .ts files, so an uploads folder
   * inside src/ would not exist in dist/ at runtime.
   */
  UPLOAD_DIR: z.string().default("uploads"),

  /** Per-file upload cap in megabytes. */
  MAX_UPLOAD_MB: z.coerce.number().positive().max(25).default(2),

  /**
   * Base URL encoded into table QR codes. Defaults to CORS_ORIGIN, since the
   * QR must open the customer app, not the API. Separate variable because in
   * production the public site and the allowed API origin can differ.
   */
  QR_BASE_URL: z.string().url().optional(),

  // Used only by the seed script; the server does not require them to boot.
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
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
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  }),

  security: Object.freeze({
    bcryptRounds: env.BCRYPT_ROUNDS,
    corsOrigin: env.CORS_ORIGIN,
  }),

  qr: Object.freeze({
    /** Falls back to the client origin when not set explicitly. */
    baseUrl: env.QR_BASE_URL ?? env.CORS_ORIGIN,
    /** Customer route a scanned code opens: <baseUrl>/t/<token>. */
    scanPath: "t",
  }),

  upload: Object.freeze({
    directory: env.UPLOAD_DIR,
    maxBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    /** Public URL prefix under which uploaded files are served. */
    publicPath: "/uploads",
  }),

  seed: Object.freeze({
    adminEmail: env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
  }),
});

export type Config = typeof config;
