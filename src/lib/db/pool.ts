import { Pool } from "pg";
import { randomBytes } from "node:crypto";
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

function createPool(user: string, password: string, max: number): DbPool {
  const env = getEnv();
  return new Pool({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user,
    password,
    ssl: env.POSTGRES_SSL === "require",
    max: env.DB_POOL_MODE === "single-use" ? 1 : max,
    // Workers disallow sockets from previous requests. Close each connection
    // after query()/release(); a checked-out transaction keeps its backend PID.
    ...(env.DB_POOL_MODE === "single-use" ? { maxUses: 1 } : {}),
  });
}

export function getAppPool(): DbPool {
  if (appPoolOverride) return appPoolOverride;
  const env = getEnv();
  if (env.DB_POOL_MODE === "single-use") {
    return createPool(env.APP_DB_USER, env.APP_DB_PASSWORD, 10);
  }
  if (!appPool) {
    appPool = createPool(env.APP_DB_USER, env.APP_DB_PASSWORD, 10);
  }
  return appPool;
}

export function getSqliPool(): DbPool {
  if (sqliPoolOverride) return sqliPoolOverride;
  const env = getEnv();
  if (env.DB_POOL_MODE === "single-use") {
    return createPool(env.SQLI_DB_USER, env.SQLI_DB_PASSWORD, 5);
  }
  if (!sqliPool) {
    sqliPool = createPool(env.SQLI_DB_USER, env.SQLI_DB_PASSWORD, 5);
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
 * Runs `fn` in a dedicated transaction bound to a one-request random context
 * token held in a custom GUC and one-time-bound to the connection's immutable
 * backend PID. Only app_role can map the token to a player. Even if a token
 * leaks through injected same-role session metadata, another connection has
 * a different PID and cannot rebind an already attached token.
 */
export async function withSqliUserContext<T>(
  userId: string,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const contextToken = randomBytes(32).toString("base64url");
  await getAppPool().query(
    "DELETE FROM sqli_challenge.request_context WHERE expires_at <= now()",
  );
  await getAppPool().query(
    `INSERT INTO sqli_challenge.request_context (context_token, user_id)
     VALUES ($1, $2)`,
    [contextToken, userId],
  );

  let client: DbClient;
  try {
    client = await getSqliPool().connect();
  } catch (connectError) {
    try {
      await getAppPool().query(
        "DELETE FROM sqli_challenge.request_context WHERE context_token = $1",
        [contextToken],
      );
    } catch (cleanupError) {
      throw new AggregateError(
        [connectError, cleanupError],
        "SQLi connection and context cleanup failed.",
      );
    }
    throw connectError;
  }

  let operationError: unknown;
  try {
    await client.query(
      "SELECT set_config('sectrain.context_token', $1, false)",
      [contextToken],
    );
    const attached = await client.query<{ attached: boolean }>(
      "SELECT sqli_challenge.attach_request_context($1) AS attached",
      [contextToken],
    );
    if (attached.rows[0]?.attached !== true) {
      throw new Error("Could not attach SQLi request context.");
    }
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    operationError = err;
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [err, rollbackError],
        "SQLi query and rollback failed.",
      );
    }
    throw err;
  } finally {
    client.release();
    try {
      await getAppPool().query(
        "DELETE FROM sqli_challenge.request_context WHERE context_token = $1",
        [contextToken],
      );
    } catch (cleanupError) {
      if (operationError !== undefined) {
        throw new AggregateError(
          [operationError, cleanupError],
          "SQLi query and context cleanup failed.",
        );
      }
      throw cleanupError;
    }
  }
}

/** Test/shutdown helper. */
export async function closeAllPools(): Promise<void> {
  await Promise.all([appPool?.end(), sqliPool?.end()]);
  appPool = undefined;
  sqliPool = undefined;
}
