import { getAppPool } from "@/lib/db/pool";
import { generateShortToken } from "@/lib/auth/tokens";
import { generateFlag } from "@/lib/challenges/flag";
import { getEnv } from "@/lib/env";
import { completeChallenge } from "@/lib/challenges/progress";

export async function getMessage(userId: string): Promise<string> {
  const result = await getAppPool().query<{ content: string }>(
    "SELECT content FROM xss_messages WHERE user_id = $1",
    [userId],
  );
  return result.rows[0]?.content ?? "";
}

/** Stores the player's guestbook message verbatim — intentionally not sanitized. */
export async function saveMessage(
  userId: string,
  content: string,
): Promise<void> {
  await getAppPool().query(
    `INSERT INTO xss_messages (user_id, content, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
    [userId, content],
  );
}

export interface RenderTokenIssue {
  token: string;
  expiresAt: Date;
}

/**
 * Issues a one-time, short-lived "render token" that ties a specific
 * rendering of the sandboxed frame to a specific secret flag value. The
 * frame route resolves this token server-side; the callback endpoint
 * requires the exact (token, flag) pair back, which only code that actually
 * executed inside the frame and read the flag could have obtained.
 */
export async function issueRenderToken(
  userId: string,
): Promise<RenderTokenIssue> {
  const env = getEnv();
  const token = generateShortToken();
  const flag = generateFlag("XSS");
  const expiresAt = new Date(
    Date.now() + env.XSS_RENDER_TOKEN_TTL_MINUTES * 60 * 1000,
  );

  await getAppPool().query(
    `INSERT INTO xss_render_tokens (token, user_id, flag, expires_at) VALUES ($1, $2, $3, $4)`,
    [token, userId, flag, expiresAt],
  );
  // Best-effort cleanup of this player's stale tokens.
  getAppPool()
    .query(
      "DELETE FROM xss_render_tokens WHERE user_id = $1 AND (used_at IS NOT NULL OR expires_at < now() - interval '1 hour')",
      [userId],
    )
    .catch(() => undefined);

  return { token, expiresAt };
}

export interface RenderTokenRecord {
  token: string;
  userId: string;
  flag: string;
}

export async function getValidRenderToken(
  token: string,
): Promise<RenderTokenRecord | null> {
  const result = await getAppPool().query<{
    token: string;
    user_id: string;
    flag: string;
  }>(
    `SELECT token, user_id, flag FROM xss_render_tokens
     WHERE token = $1 AND used_at IS NULL AND expires_at > now()`,
    [token],
  );
  const row = result.rows[0];
  return row ? { token: row.token, userId: row.user_id, flag: row.flag } : null;
}

export interface CallbackOutcome {
  success: boolean;
  justCompleted?: boolean;
  reason?: string;
}

/**
 * The "safe server callback": authenticates the exfiltration attempt purely
 * by (one-time token, matching flag) knowledge — never by ambient cookies,
 * since the sandboxed frame has an opaque origin and cannot present any.
 */
export async function submitCallback(
  token: string,
  flag: string,
): Promise<CallbackOutcome> {
  const record = await getValidRenderToken(token);
  if (!record) {
    return {
      success: false,
      reason: "Invalid, expired, or already-used token.",
    };
  }
  if (record.flag !== flag) {
    return { success: false, reason: "Flag value does not match." };
  }

  const updated = await getAppPool().query(
    "UPDATE xss_render_tokens SET used_at = now() WHERE token = $1 AND used_at IS NULL",
    [token],
  );
  if ((updated.rowCount ?? 0) === 0) {
    return { success: false, reason: "Token already used." };
  }

  const justCompleted = await completeChallenge(record.userId, "xss");
  return { success: true, justCompleted };
}
