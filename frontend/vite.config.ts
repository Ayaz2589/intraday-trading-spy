/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    // Feature 007: file-based routing under src/routes/
    TanStackRouterVite({ routesDirectory: "./src/routes" }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    // Feature 007: the frontend talks to the Feature 006 backend (port 8001
    // by default; override with VITE_API_PORT). The pre-feature static
    // server on :8000 is no longer used by the UI.
    proxy: {
      "/api": `http://localhost:${process.env.VITE_API_PORT || 8001}`,
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./test/setup.ts", "./src/__tests__/setup.ts"],
    css: false,
  },
});
