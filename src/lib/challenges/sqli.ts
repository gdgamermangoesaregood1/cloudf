import { getAppPool } from "@/lib/db/pool";
import { withSqliUserContext } from "@/lib/db/pool";
import { generateFlag } from "@/lib/challenges/flag";
import { completeChallenge } from "@/lib/challenges/progress";
import type { QueryableClient } from "@/lib/challenges/progress";

const CATALOG = [
  {
    title: "Blue Widget",
    description: "A dependable, mid-size widget for general use.",
  },
  {
    title: "Red Widget",
    description: "Higher torque variant of the standard widget.",
  },
  { title: "Widget Polish", description: "Keeps your widgets shiny." },
  { title: "Widget Crate", description: "Holds up to twelve widgets." },
];

const FLAG_PATTERN = /FLAG-SQLI-[0-9a-f]{16}/;

/**
 * Seeds this player's row set in the challenge-only `sqli_challenge.items`
 * table via the app_role connection (INSERT/UPDATE/DELETE only — app_role
 * cannot SELECT this table, so even the trusted app code path never reads
 * flag values back out).
 */
export async function seedSqliItems(
  userId: string,
  client: QueryableClient = getAppPool(),
): Promise<void> {
  await client.query("DELETE FROM sqli_challenge.items WHERE user_id = $1", [
    userId,
  ]);
  const flag = generateFlag("SQLI");
  for (const item of CATALOG) {
    await client.query(
      `INSERT INTO sqli_challenge.items (user_id, title, description, secret_flag)
       VALUES ($1, $2, $3, $4)`,
      [userId, item.title, item.description, flag],
    );
  }
}

export interface SqliSearchOutcome {
  rows: Record<string, unknown>[];
  error?: string;
  justCompleted?: boolean;
}

/**
 * THE INTENTIONALLY VULNERABLE QUERY: the search term is concatenated
 * directly into the SQL text instead of being bound as a parameter. This is
 * deliberate — the lesson is that it's the database boundary (separate
 * schema, least-privilege `sqli_role`, Row-Level Security), not perfect
 * application code, that keeps this contained.
 */
export async function searchItems(
  userId: string,
  term: string,
): Promise<SqliSearchOutcome> {
  // completeChallenge() below intentionally runs AFTER withSqliUserContext
  // returns (i.e. once the sqli_role transaction/connection has fully
  // committed and closed) rather than nested inside it — keeping the two
  // pools' connections non-overlapping is both cleaner and avoids relying
  // on cross-connection visibility mid-transaction.
  let shouldComplete = false;

  const outcome = await withSqliUserContext(userId, async (client) => {
    const query = `SELECT id, title, description FROM items WHERE title ILIKE '%${term}%' ORDER BY id`;
    try {
      const result = await client.query(query);
      const rows = result.rows as Record<string, unknown>[];

      const hasFlagShaped = rows.some((row) =>
        Object.values(row).some(
          (v) => typeof v === "string" && FLAG_PATTERN.test(v),
        ),
      );
      if (hasFlagShaped) {
        // Confirm against the real, safely-parameterized value for this
        // player before granting credit — never trust a user-typed
        // lookalike string as proof of a successful injection.
        const confirm = await client.query(
          "SELECT secret_flag FROM items WHERE user_id = $1 LIMIT 1",
          [userId],
        );
        const realFlag = (
          confirm.rows[0] as { secret_flag?: string } | undefined
        )?.secret_flag;
        shouldComplete = realFlag
          ? rows.some((row) => Object.values(row).some((v) => v === realFlag))
          : false;
      }

      return { rows };
    } catch (err) {
      // Surface the raw database error message (as a real vulnerable app
      // would) — this is itself part of the learning experience (error-based
      // enumeration) and is fully contained by the schema/role boundary.
      const message = err instanceof Error ? err.message : "Query failed";
      return { rows: [], error: message };
    }
  });

  const justCompleted = shouldComplete
    ? await completeChallenge(userId, "sqli")
    : undefined;
  return { ...outcome, justCompleted };
}
