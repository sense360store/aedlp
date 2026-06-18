import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // App version / commit surfaced in privacy-safe parse diagnostics. Prefer an
  // explicit VITE_APP_VERSION, else the Vercel build commit, else "dev".
  define: {
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "dev"),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "api/**/*.test.ts"],
  },
});
