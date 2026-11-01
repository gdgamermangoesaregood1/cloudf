import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { applyRoles } from "../../db/apply-roles";
import type { DbClient, DbPool, QueryResultLike } from "@/lib/db/pool";

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "db", "migrations");
const SCRATCH_ROOT = path.join(__dirname, "..", ".pglite-tmp");

/**
 * Builds a fresh, fully-migrated PostgreSQL database (via pglite, file-
 * backed under tests/.pglite-tmp so it can be safely reopened) for a single
 * test, and exposes it as three `DbPool`s that mirror the real app's
 * connection-level privilege separation:
 *  - `ownerPool`: the unrestricted bootstrap superuser — used only for test
 *    fixtures/ground-truth assertions, never to exercise application logic
 *    that is supposed to be privilege-restricted.
 *  - `appPool`: connects as `app_role`, exactly like the real app server.
 *  - `sqliPool`: connects as `sqli_role`, exactly like the real SQLi
 *    challenge endpoint.
 *
 * PostgreSQL's `SET SESSION AUTHORIZATION` (used to switch role) requires
 * superuser privilege AND is a one-way drop within a connection — a
 * non-superuser can never regain it. So every pool operation here opens its
 * own short-lived pglite connection, applies its role (if any), runs the
 * operation, and closes — exercising the exact same production
 * GRANT/REVOKE/RLS boundaries a real per-request connection would. Multiple
 * pglite connections against the same directory may have overlapping
 * lifetimes (e.g. application code legitimately using `appPool` *while* a
 * `sqliPool` transaction is still open, such as marking a challenge
 * complete mid-request) — this is safe as long as each connection is only
 * *opened* after any write it needs to observe has already been committed,
 * which is guaranteed here since the whole suite runs single-threaded and
 * fully sequential (see vitest.config.ts `fileParallelism: false`).
 */
export async function createTestDb(options?: { throughMigration?: string }) {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const dir = path.join(SCRATCH_ROOT, randomUUID());
  mkdirSync(dir, { recursive: true });
  // Tracks every close() promise (including "fire and forget" ones from
  // client.release(), which production code does not await) so db.close()
  // can wait for all of them before deleting the directory.
  const pendingCloses: Promise<unknown>[] = [];

  const bootstrap = await PGlite.create(dir);
  await applyRoles(bootstrap, {
    appUser: "app_role",
    appPassword: "test-app-role-password",
    sqliUser: "sqli_role",
    sqliPassword: "test-sqli-role-password",
  });
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !options?.throughMigration || f <= options.throughMigration)
    .sort();
  for (const file of files) {
    await bootstrap.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await bootstrap.close();

  function normalize<T>(result: {
    rows: T[];
    affectedRows?: number;
  }): QueryResultLike<T> {
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }

  async function openWithRole(
    role: "app_role" | "sqli_role" | null,
  ): Promise<PGlite> {
    // Ensure any connections that are mid-close (e.g. from a `release()`
    // call that production code did not await) fully flush to the shared
    // on-disk store before we open a new one, so commits made through one
    // pool are always visible to the next connection opened on another.
    if (pendingCloses.length > 0) {
      await Promise.allSettled(pendingCloses.splice(0, pendingCloses.length));
    }
    const pg = await PGlite.create(dir);
    if (role) {
      await pg.query(`SET SESSION AUTHORIZATION ${role};`);
      if (role === "sqli_role") {
        await pg.query("SET search_path = sqli_challenge, public;");
      }
    }
    return pg;
  }

  function makePool(role: "app_role" | "sqli_role" | null): DbPool {
    return {
      async query<T>(sql: string, params?: unknown[]) {
        const pg = await openWithRole(role);
        try {
          const result = await pg.query<T>(
            sql,
            params as unknown[] | undefined,
          );
          return normalize(result);
        } finally {
          // Best-effort close: never let a lingering close() reject
          // unhandled (it may race with a later test's directory cleanup).
          pendingCloses.push(pg.close().catch(() => undefined));
        }
      },
      async connect(): Promise<DbClient> {
        const pg = await openWithRole(role);
        let closed = false;
        return {
          async query<T>(sql: string, params?: unknown[]) {
            const result = await pg.query<T>(
              sql,
              params as unknown[] | undefined,
            );
            return normalize(result);
          },
          release() {
            if (closed) return;
            closed = true;
            pendingCloses.push(pg.close().catch(() => undefined));
          },
        };
      },
      async end() {
        /* no persistent handle; each operation opens/closes its own connection */
      },
    };
  }

  return {
    dir,
    ownerPool: makePool(null),
    appPool: makePool("app_role"),
    sqliPool: makePool("sqli_role"),
    async applyMigration(file: string) {
      if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) {
        throw new Error("Invalid migration file name.");
      }
      const pg = await openWithRole(null);
      try {
        await pg.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
      } finally {
        pendingCloses.push(pg.close().catch(() => undefined));
      }
    },
    async close() {
      await Promise.allSettled(pendingCloses);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Cleans up the whole scratch root once after all suites have finished. */
export function cleanupAllTestDbs(): void {
  rmSync(SCRATCH_ROOT, { recursive: true, force: true });
}
