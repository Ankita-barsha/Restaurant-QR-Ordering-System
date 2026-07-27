import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {
    // Listen on every interface, not just 127.0.0.1, so a phone on the same
    // Wi-Fi can reach the dev server. Vite prints the LAN URL on startup.
    host: true,
  },

  build: {
    rolldownOptions: {
      output: {
        /**
         * Vendor code is split out from application code.
         *
         * Not for size — the bytes are the same either way — but for CACHING.
         * React, the router and the data layer change only when a dependency is
         * upgraded, while application code changes on every deploy. In one
         * chunk, editing a single component invalidates the whole download for
         * every returning diner; split, they re-fetch a few kilobytes.
         */
        advancedChunks: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
            },
            {
              name: "vendor-data",
              test: /node_modules[\\/](@tanstack|axios|socket\.io-client|engine\.io-client|zod)/,
            },
          ],
        },
      },
    },
  },
});
