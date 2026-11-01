import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-test-harness";
import { __setPoolsForTests } from "@/lib/db/pool";
import {
  getAdvancedLabView,
  runAdvancedLab,
  seedAdvancedLabs,
} from "@/lib/challenges/advanced-labs";
import { getProgress, initializeProgress } from "@/lib/challenges/progress";

async function createUser(db: TestDb, username: string): Promise<string> {
  const result = await db.appPool.query<{ id: string }>(
    "INSERT INTO users (username, password_hash) VALUES ($1, 'hash') RETURNING id",
    [username],
  );
  return result.rows[0]!.id;
}

describe("advanced contained challenge simulators", () => {
  let db: TestDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    __setPoolsForTests({ appPool: db.appPool, sqliPool: db.sqliPool });
    userId = await createUser(db, "advanced_player");
    await initializeProgress(userId);
    await seedAdvancedLabs(userId);
    await db.appPool.query(
      `UPDATE challenge_progress
       SET unlocked = sort_order <= 16,
           completed_at = CASE WHEN sort_order < 16 THEN now() ELSE NULL END
       WHERE user_id = $1`,
      [userId],
    );
  });

  afterEach(async () => {
    __setPoolsForTests({});
    await db.close();
  });

  it("supports levels 16-30 in order through only bounded simulators", async () => {
    const exploits = [
      ["mass-assignment", '{"displayName":"analyst","role":"admin"}'],
      ["open-redirect", "https://attacker.invalid/callback"],
      ["cors-misconfiguration", "https://attacker.invalid"],
      ["jwt-confusion", "alg=HS256;role=admin;key=LAB-RSA-PUBLIC"],
      [
        "nosql-injection",
        '{"username":{"$ne":null},"password":{"$ne":null}}',
      ],
      ["graphql-authorization", 'query { user(id:"2") { privateNote } }'],
      ["coupon-race", "RACE 2"],
      ["prototype-pollution", '{"__proto__":{"isAdmin":true}}'],
      [
        "deserialization",
        '{"type":"DiagnosticJob","action":"revealFlag"}',
      ],
      [
        "request-smuggling",
        "POST / HTTP/1.1\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nGET /admin/flag HTTP/1.1",
      ],
    ] as const;

    for (const [key, payload] of exploits) {
      const result = await runAdvancedLab(userId, key, payload);
      expect(result.completed, key).toBe(true);
      expect(result.output, key).toContain("FLAG-");
    }

    expect(
      await runAdvancedLab(userId, "cache-poisoning", "PRIME attacker.invalid"),
    ).toMatchObject({ completed: false });
    expect(
      await runAdvancedLab(userId, "cache-poisoning", "GET"),
    ).toMatchObject({ completed: true });

    const finalExploits = [
      ["host-header-injection", "attacker.invalid"],
      [
        "oauth-failure",
        "state=missing&redirect_uri=https%3A%2F%2Fattacker.invalid%2Fcallback&code=fictional",
      ],
      ["websocket-authorization", "AUTH guest\nSUBSCRIBE admin.audit"],
    ] as const;
    for (const [key, payload] of finalExploits) {
      expect(
        (await runAdvancedLab(userId, key, payload)).completed,
        key,
      ).toBe(true);
    }

    expect(
      await runAdvancedLab(userId, "capstone", "ASSIGN role=admin"),
    ).toMatchObject({ completed: false });
    expect(
      await runAdvancedLab(userId, "capstone", "PRIME attacker.invalid"),
    ).toMatchObject({ completed: false });
    expect(
      await runAdvancedLab(userId, "capstone", "SUBSCRIBE admin.audit"),
    ).toMatchObject({ completed: true });

    const progress = await getProgress(userId);
    expect(progress).toHaveLength(30);
    expect(progress.every((row) => row.completedAt !== null)).toBe(true);
  });

  it("does not mutate prototypes, execute jobs, or open sockets", async () => {
    const polluted = await runAdvancedLab(
      userId,
      "prototype-pollution",
      '{"__proto__":{"isAdmin":true}}',
    );
    expect(polluted.output).toContain("Global prototype mutation: false");
    expect(
      ({} as Record<string, unknown>).isAdmin,
    ).toBeUndefined();

    const deserialized = await runAdvancedLab(
      userId,
      "deserialization",
      '{"type":"DiagnosticJob","action":"revealFlag"}',
    );
    expect(deserialized.output).toContain("Execution performed: false");

    const protocol = await runAdvancedLab(
      userId,
      "websocket-authorization",
      "AUTH guest\nSUBSCRIBE admin.audit",
    );
    expect(protocol.output).toContain("Socket opened: false");
  });

  it("keeps mutable cache, race, and capstone state per player and bounded", async () => {
    const secondUser = await createUser(db, "isolated_player");
    await initializeProgress(secondUser);
    await seedAdvancedLabs(secondUser);

    await runAdvancedLab(userId, "cache-poisoning", "PRIME attacker.invalid");
    const firstCache = await getAdvancedLabView(userId, "cache-poisoning");
    const secondCache = await getAdvancedLabView(secondUser, "cache-poisoning");
    expect(firstCache.evidence).toContain("attacker.invalid");
    expect(secondCache.evidence).toContain("(empty)");

    await runAdvancedLab(userId, "coupon-race", "RACE 2");
    await runAdvancedLab(userId, "coupon-race", "RACE 2");
    const state = await db.appPool.query<{ redemptions: number }>(
      `SELECT (state->>'redemptions')::int AS redemptions
       FROM advanced_challenge_state
       WHERE user_id = $1 AND challenge_key = 'coupon-race'`,
      [userId],
    );
    expect(state.rows[0]!.redemptions).toBe(2);

    await runAdvancedLab(userId, "capstone", "ASSIGN role=admin");
    expect((await getAdvancedLabView(userId, "capstone")).evidence).toContain(
      "stage: 1/3",
    );
    expect((await getAdvancedLabView(secondUser, "capstone")).evidence).toContain(
      "stage: 0/3",
    );
  });

  it("reset seeding regenerates flags and clears mutable state", async () => {
    await runAdvancedLab(userId, "cache-poisoning", "PRIME attacker.invalid");
    const before = await db.appPool.query<{ secret_flag: string }>(
      `SELECT secret_flag FROM advanced_challenge_state
       WHERE user_id = $1 AND challenge_key = 'cache-poisoning'`,
      [userId],
    );

    await seedAdvancedLabs(userId);
    const after = await db.appPool.query<{
      secret_flag: string;
      cached_host: string | null;
    }>(
      `SELECT secret_flag, state->>'cachedHost' AS cached_host
       FROM advanced_challenge_state
       WHERE user_id = $1 AND challenge_key = 'cache-poisoning'`,
      [userId],
    );
    expect(after.rows[0]!.secret_flag).not.toBe(before.rows[0]!.secret_flag);
    expect(after.rows[0]!.cached_host).toBeNull();
  });
});

describe("levels 16-30 migration backfill", () => {
  it("backfills existing users and unlocks level 16 only after level 15", async () => {
    const db = await createTestDb({ throughMigration: "0006_extended_challenges.sql" });
    try {
      const completedUser = await createUser(db, "completed_old_player");
      const incompleteUser = await createUser(db, "incomplete_old_player");
      await db.appPool.query(
        `INSERT INTO challenge_progress
           (user_id, challenge_key, sort_order, unlocked, completed_at)
         VALUES
           ($1, 'exception-handling', 15, true, now()),
           ($2, 'exception-handling', 15, true, NULL)`,
        [completedUser, incompleteUser],
      );

      await db.applyMigration("0007_levels_16_30.sql");

      const rows = await db.appPool.query<{
        user_id: string;
        challenge_key: string;
        unlocked: boolean;
      }>(
        `SELECT user_id, challenge_key, unlocked
         FROM challenge_progress
         WHERE challenge_key = 'mass-assignment'
         ORDER BY user_id`,
      );
      expect(rows.rows).toHaveLength(2);
      expect(
        rows.rows.find((row) => row.user_id === completedUser)?.unlocked,
      ).toBe(true);
      expect(
        rows.rows.find((row) => row.user_id === incompleteUser)?.unlocked,
      ).toBe(false);

      const states = await db.appPool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM advanced_challenge_state",
      );
      expect(states.rows[0]!.count).toBe("30");
      await expect(
        db.appPool.query(
          `INSERT INTO challenge_progress
             (user_id, challenge_key, sort_order, unlocked)
           VALUES ($1, 'not-approved', 31, false)`,
          [completedUser],
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});
