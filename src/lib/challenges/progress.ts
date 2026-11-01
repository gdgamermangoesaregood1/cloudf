import { getAppPool } from "@/lib/db/pool";
import {
  CHALLENGES,
  getChallengeMeta,
  nextChallengeKey,
  type ChallengeKey,
} from "@/lib/challenges/registry";
import { requireActiveEntitlement } from "@/lib/billing/entitlements";

export class ChallengeAccessError extends Error {
  constructor(
    public status: 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

export interface ChallengeProgressRow {
  key: ChallengeKey;
  order: number;
  title: string;
  path: string;
  unlocked: boolean;
  completedAt: string | null;
}

export interface QueryableClient {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/** Seeds the fixed curriculum progress table for a brand-new (or reset) player. */
export async function initializeProgress(
  userId: string,
  client: QueryableClient = getAppPool(),
): Promise<void> {
  await client.query("DELETE FROM challenge_progress WHERE user_id = $1", [
    userId,
  ]);
  const values: unknown[] = [];
  const rows = CHALLENGES.map((challenge, index) => {
    const offset = index * 4;
    values.push(userId, challenge.key, challenge.order, challenge.order === 1);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, NULL)`;
  });
  await client.query(
    `INSERT INTO challenge_progress
       (user_id, challenge_key, sort_order, unlocked, completed_at)
     VALUES ${rows.join(", ")}`,
    values,
  );
}

export async function getProgress(
  userId: string,
): Promise<ChallengeProgressRow[]> {
  const result = await getAppPool().query<{
    challenge_key: ChallengeKey;
    unlocked: boolean;
    completed_at: string | null;
  }>(
    `SELECT challenge_key, unlocked, completed_at
     FROM challenge_progress WHERE user_id = $1`,
    [userId],
  );
  const byKey = new Map(result.rows.map((r) => [r.challenge_key, r]));
  return CHALLENGES.map((meta) => {
    const row = byKey.get(meta.key);
    return {
      key: meta.key,
      order: meta.order,
      title: meta.title,
      path: meta.path,
      unlocked: row?.unlocked ?? false,
      completedAt: row?.completed_at ?? null,
    };
  });
}

/**
 * Authoritative, server-side "current level" access check. Verifies both
 * that this specific challenge is flagged unlocked AND (defense-in-depth)
 * that every earlier challenge in the sequence is already completed, so a
 * desynced `unlocked` flag alone can never grant early access.
 */
export async function requireChallengeAccess(
  userId: string,
  key: ChallengeKey,
): Promise<void> {
  await requireActiveEntitlement(userId);
  const meta = getChallengeMeta(key);
  const progress = await getProgress(userId);
  const row = progress.find((p) => p.key === key);
  if (!row || !row.unlocked) {
    throw new ChallengeAccessError(
      403,
      "This challenge is locked. Complete the earlier challenges first.",
    );
  }
  const earlierIncomplete = progress.some(
    (p) => p.order < meta.order && !p.completedAt,
  );
  if (earlierIncomplete) {
    throw new ChallengeAccessError(
      403,
      "Complete the earlier challenges first.",
    );
  }
}

/**
 * Marks a challenge complete (idempotent) and unlocks the next one in
 * sequence. Returns true only the first time it is completed.
 */
export async function completeChallenge(
  userId: string,
  key: ChallengeKey,
): Promise<boolean> {
  const pool = getAppPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE challenge_progress SET completed_at = now()
       WHERE user_id = $1 AND challenge_key = $2 AND completed_at IS NULL
       RETURNING challenge_key`,
      [userId, key],
    );
    const justCompleted = (updated.rowCount ?? 0) > 0;
    if (justCompleted) {
      const next = nextChallengeKey(key);
      if (next) {
        await client.query(
          `UPDATE challenge_progress SET unlocked = true
           WHERE user_id = $1 AND challenge_key = $2`,
          [userId, next],
        );
      }
    }
    await client.query("COMMIT");
    return justCompleted;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
