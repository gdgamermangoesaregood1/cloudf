import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "./db-test-harness";
import { __setPoolsForTests } from "@/lib/db/pool";
import { initializeProgress, getProgress } from "@/lib/challenges/progress";
import { seedSqliItems, searchItems } from "@/lib/challenges/sqli";

async function createUser(db: TestDb, username: string): Promise<string> {
  const result = await db.appPool.query<{ id: string }>(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
    [username, "hash"],
  );
  return result.rows[0]!.id;
}

describe("SQL injection challenge (isolated schema + least-privilege role + RLS)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    __setPoolsForTests({ appPool: db.appPool, sqliPool: db.sqliPool });
  });

  afterEach(async () => {
    __setPoolsForTests({});
    await db.close();
  });

  it("a normal search never exposes the secret_flag column", async () => {
    const userId = await createUser(db, "sqli_player_1");
    await initializeProgress(userId);
    await seedSqliItems(userId);

    const outcome = await searchItems(userId, "Widget");
    expect(outcome.error).toBeUndefined();
    expect(outcome.rows.length).toBeGreaterThan(0);
    for (const row of outcome.rows) {
      expect(Object.keys(row)).not.toContain("secret_flag");
    }
    expect(outcome.justCompleted).toBeUndefined();
  });

  it("a single quote breaks the query and surfaces a contained database error", async () => {
    const userId = await createUser(db, "sqli_player_2");
    await initializeProgress(userId);
    await seedSqliItems(userId);

    // An unmatched single quote (without a closing structure) should
    // produce a syntax error from the database, proving the term is
    // concatenated directly into the SQL text rather than bound safely.
    const broken = await searchItems(userId, "widget'");
    expect(broken.error).toBeTruthy();
    expect(broken.rows).toHaveLength(0);
  });

  it("a UNION-based injection reveals the flag column — and completes the challenge", async () => {
    const userId = await createUser(db, "sqli_player_3");
    await initializeProgress(userId);
    await seedSqliItems(userId);

    const payload =
      "nonexistent' UNION SELECT id, secret_flag, 'x' FROM items -- ";
    const outcome = await searchItems(userId, payload);
    expect(outcome.error).toBeUndefined();
    expect(
      outcome.rows.some((row) =>
        Object.values(row).some(
          (v) => typeof v === "string" && /FLAG-SQLI-/.test(v),
        ),
      ),
    ).toBe(true);
    expect(outcome.justCompleted).toBe(true);

    const progress = await getProgress(userId);
    expect(progress.find((p) => p.key === "sqli")?.completedAt).not.toBeNull();
  });

  it("RLS keeps the injection scoped to the player's own row — never another player's flag", async () => {
    const userA = await createUser(db, "sqli_player_a");
    const userB = await createUser(db, "sqli_player_b");
    await initializeProgress(userA);
    await initializeProgress(userB);
    await seedSqliItems(userA);
    await seedSqliItems(userB);

    const payload =
      "nonexistent' UNION SELECT id, secret_flag, 'x' FROM items -- ";
    const outcomeA = await searchItems(userA, payload);
    const outcomeB = await searchItems(userB, payload);

    const flagsInA = outcomeA.rows
      .flatMap((r) => Object.values(r))
      .filter(
        (v): v is string => typeof v === "string" && /FLAG-SQLI-/.test(v),
      );
    const flagsInB = outcomeB.rows
      .flatMap((r) => Object.values(r))
      .filter(
        (v): v is string => typeof v === "string" && /FLAG-SQLI-/.test(v),
      );

    expect(flagsInA.length).toBeGreaterThan(0);
    expect(flagsInB.length).toBeGreaterThan(0);
    expect(flagsInA[0]).not.toBe(flagsInB[0]);
  });

  it("the sqli_role connection cannot read credentials even via injection (schema/grant boundary)", async () => {
    const userId = await createUser(db, "sqli_player_4");
    await initializeProgress(userId);
    await seedSqliItems(userId);

    // Attempt to pivot to the public.users table entirely via injection.
    const payload =
      "nonexistent' UNION SELECT id, username, password_hash FROM public.users -- ";
    const outcome = await searchItems(userId, payload);
    // The database itself refuses (permission denied) — surfaced as a
    // contained query error, not a data leak.
    expect(outcome.error).toBeTruthy();
    expect(outcome.rows).toHaveLength(0);
  });
});
