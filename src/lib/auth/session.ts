import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { getAppPool } from "@/lib/db/pool";
import { generateOpaqueToken, sha256Hex } from "@/lib/auth/tokens";
import { SESSION_COOKIE, CSRF_COOKIE } from "@/lib/auth/cookie-names";

export { SESSION_COOKIE, CSRF_COOKIE };

export interface AuthedUser {
  id: string;
  username: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  csrfSecret: string;
  expiresAt: Date;
}

function cookieBaseOptions() {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * Creates a new opaque, hashed, database-backed session for a user and
 * writes the session + (readable) CSRF cookies to the current response.
 * Must be called from a Route Handler or Server Action.
 */
export async function createSessionAndSetCookies(
  userId: string,
): Promise<void> {
  const env = getEnv();
  const token = generateOpaqueToken();
  const csrfSecret = generateOpaqueToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  );

  await getAppPool().query(
    `INSERT INTO sessions (user_id, token_hash, csrf_secret, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, csrfSecret, expiresAt],
  );

  const jar = await cookies();
  const base = cookieBaseOptions();
  jar.set(SESSION_COOKIE, token, { ...base, expires: expiresAt });
  // The CSRF cookie must be readable by client-side JS (double-submit
  // pattern), so it is intentionally NOT httpOnly. It carries no secret
  // authority on its own — the server always re-validates it against the
  // csrf_secret stored server-side for the caller's actual session.
  jar.set(CSRF_COOKIE, csrfSecret, {
    ...base,
    httpOnly: false,
    expires: expiresAt,
  });
}

/** Reads + validates the current request's session against the database. */
export async function getCurrentSession(): Promise<{
  session: SessionRecord;
  user: AuthedUser;
} | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256Hex(token);
  let result;
  try {
    result = await getAppPool().query<{
      id: string;
      user_id: string;
      csrf_secret: string;
      expires_at: Date;
      revoked_at: Date | null;
      username: string;
    }>(
      `SELECT s.id, s.user_id, s.csrf_secret, s.expires_at, s.revoked_at, u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [tokenHash],
    );
  } catch (err) {
    // A database outage must never crash page rendering — fail safe as
    // "not authenticated" and let the caller redirect to /login.
    console.error("Session lookup failed:", err);
    return null;
  }

  const row = result.rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  // Best-effort activity bookkeeping; failures here must never block auth.
  getAppPool()
    .query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [row.id])
    .catch(() => undefined);

  return {
    session: {
      id: row.id,
      userId: row.user_id,
      csrfSecret: row.csrf_secret,
      expiresAt: new Date(row.expires_at),
    },
    user: { id: row.user_id, username: row.username },
  };
}

/** Revokes the session in the database and clears cookies on the response. */
export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = sha256Hex(token);
    // Best-effort: even if the database is unreachable, still clear the
    // browser's cookies below so the user is logged out client-side.
    await getAppPool()
      .query(
        "UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
        [tokenHash],
      )
      .catch((err) => console.error("Session revoke failed:", err));
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}
