import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/load-env.ts"],
    // Supabase suites make real network calls; everything else is in-process.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
