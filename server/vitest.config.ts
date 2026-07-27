import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /**
     * Fills in a valid-looking environment before any module is imported.
     *
     * config/env.ts validates process.env at module load and calls
     * process.exit(1) if it is wrong — which, in a test run, kills the runner
     * with no explanation. Anything that transitively imports the config (most
     * of the server) therefore needs this in place first.
     */
    setupFiles: ["./src/test/env.setup.ts"],
  },
});
