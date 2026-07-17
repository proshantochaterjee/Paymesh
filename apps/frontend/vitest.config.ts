import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest 4's default `oxc` transform doesn't defer to `@vitejs/plugin-react`'s
  // babel-based transform (same conflict apps/backend's vitest.config.ts hits
  // with unplugin-swc) — disable oxc so the React plugin actually handles JSX.
  oxc: false,
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
