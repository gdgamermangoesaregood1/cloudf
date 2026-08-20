// Global Vitest setup: provides dummy values for required env vars so
// `getEnv()` (used throughout the app, e.g. for session TTL / XSS render
// token TTL) never throws during tests. The actual database pools are
// swapped out per-test via `__setPoolsForTests` (see
// tests/integration/db-test-harness.ts), so these Postgres credentials are
// never really used to open a network connection.
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.COOKIE_SECURE ??= "false";
process.env.SESSION_TTL_HOURS ??= "12";
process.env.POSTGRES_HOST ??= "localhost";
process.env.POSTGRES_PORT ??= "5432";
process.env.POSTGRES_DB ??= "security_training_test";
process.env.APP_DB_USER ??= "app_role";
process.env.APP_DB_PASSWORD ??= "test-only-password";
process.env.SQLI_DB_USER ??= "sqli_role";
process.env.SQLI_DB_PASSWORD ??= "test-only-password";
process.env.XSS_RENDER_TOKEN_TTL_MINUTES ??= "5";

// pglite (WASM Postgres) occasionally rejects an already-in-flight internal
// operation when its on-disk store is removed immediately after a
// best-effort close() during test teardown (tests/integration/db-test-
// harness.ts). This is harmless — the actual pool operation it belonged to
// has already resolved and its assertions already ran — but Node reports it
// as an unhandled rejection. Swallow only this known, benign category so it
// cannot mask a real failure elsewhere.
process.setMaxListeners(20);
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const name = (reason as { name?: string } | undefined)?.name ?? "";
  if (name === "ErrnoError" || /pglite|wasm/i.test(message)) {
    return;
  }
  throw reason;
});
