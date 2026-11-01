import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 300000,
    hookTimeout: 300000,
    // pglite (WASM Postgres) spins up real engine processes per test; running
    // many of those concurrently across worker threads causes resource
    // contention (WASM aborts, spurious permission errors). Force fully
    // sequential execution for correctness over raw speed.
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
