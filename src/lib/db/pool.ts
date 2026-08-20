import { Pool } from "pg";
import { getEnv } from "@/lib/env";

/**
 * Two separate connection pools enforce least privilege at the network/auth
 * layer, not just in application code:
 *  - `appPool` uses `app_role`, which owns the core app tables (users,
 *    sessions, challenge progress, IDOR world data, XSS messages) but has
 *    NO grants on the `sqli_challenge` schema.
 *  - `sqliPool` uses `sqli_role`, which can only SELECT from
 *    `sqli_challenge.items` (RLS-scoped to the current player) and has no
 *    grants on `public.users`, `public.sessions`, or any other table. Even a
 *    successful SQL injection through this pool cannot read credentials or
 *    other players' data.
 *
 * `DbPool`/`DbClient` are minimal structural interfaces (rather than pg's
 * concrete `Pool`/`PoolClient` types) so the test suite can substitute an
 * in-memory (pglite) database and exercise the exact same production code
 * paths without Docker or a real network Postgres server.
 */
export interface QueryResultLike<T> {
  rows: T[];
  rowCount?: number | null;
}

export interface DbClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResultLike<T>>;
  release(): void;
}

export interface DbPool {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResultLike<T>>;
  connect(): Promise<DbClient>;
  end(): Promise<void>;
}

let appPool: DbPool | undefined;
let sqliPool: DbPool | undefined;
let appPoolOverride: DbPool | undefined;
let sqliPoolOverride: DbPool | undefined;

export function getAppPool(): DbPool {
  if (appPoolOverride) return appPoolOverride;
  if (!appPool) {
    const env = getEnv();
    appPool = new Pool({
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.APP_DB_USER,
      password: env.APP_DB_PASSWORD,
      max: 10,
    });
  }
  return appPool;
}

export function getSqliPool(): DbPool {
  if (sqliPoolOverride) return sqliPoolOverride;
  if (!sqliPool) {
    const env = getEnv();
    sqliPool = new Pool({
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.SQLI_DB_USER,
      password: env.SQLI_DB_PASSWORD,
      max: 5,
    });
  }
  return sqliPool;
}

/**
 * Test-only seam: lets the test suite substitute an in-memory (pglite)
 * database for the real network Postgres pools. Never called from
 * application code.
 */
export function __setPoolsForTests(overrides: {
  appPool?: DbPool;
  sqliPool?: DbPool;
}): void {
  appPoolOverride = overrides.appPool;
  sqliPoolOverride = overrides.sqliPool;
}

/**
 * Runs `fn` with a dedicated client that has PostgreSQL Row-Level Security
 * variable `app.current_user_id` set for the duration of a transaction, via
 * the parameterized `set_config()` call (never string-concatenated). RLS
 * policies on `sqli_challenge.items` use this setting to scope every query
 * — including anything an injection payload adds — to the current player's
 * own rows.
 */
export async function withSqliUserContext<T>(
  userId: string,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const pool = getSqliPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [
      userId,
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Test/shutdown helper. */
export async function closeAllPools(): Promise<void> {
  await Promise.all([appPool?.end(), sqliPool?.end()]);
  appPool = undefined;
  sqliPool = undefined;
}
