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
});