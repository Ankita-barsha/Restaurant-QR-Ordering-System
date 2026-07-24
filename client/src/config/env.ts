/**
 * Client environment configuration.
 *
 * The only module that reads `import.meta.env`. Mirrors the server's
 * config layer so both sides of the stack behave identically.
 *
 * SECURITY: everything here ships to the browser in plain text. Vite only
 * exposes variables prefixed with VITE_, which is a guardrail, not a vault.
 * Never put a secret, API key, or token in a VITE_ variable.
 */

import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z
    .string()
    .min(1, "VITE_API_URL is required")
    .url("VITE_API_URL must be a valid URL"),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  // Vite surfaces this in the terminal and the browser overlay, and it fails
  // the production build rather than shipping a broken bundle.
  throw new Error(`Invalid client environment configuration:\n${details}`);
}

export const config = Object.freeze({
  apiUrl: parsed.data.VITE_API_URL,
  isProduction: import.meta.env.PROD,
  isDevelopment: import.meta.env.DEV,
});

export type Config = typeof config;
