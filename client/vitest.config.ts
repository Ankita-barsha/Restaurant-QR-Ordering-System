import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node, not jsdom: these cover the pure logic behind what the customer is
    // shown — money arithmetic and route selection — not rendering.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
