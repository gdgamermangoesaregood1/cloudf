import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "./db-test-harness";
import { __setPoolsForTests } from "@/lib/db/pool";
import {
  initializeProgress,
  getProgress,
  requireChallengeAccess,
  completeChallenge,
  ChallengeAccessError,
} from "@/lib/challenges/progress";

async function createUser(db: TestDb, username: string): Promise<string> {
  const result = await db.appPool.query<{ id: string }>(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
    [username, "hash"],
  );
  return result.rows[0]!.id;
}

describe("challenge progress / sequential unlock", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    __setPoolsForTests({ appPool: db.appPool, sqliPool: db.sqliPool });
  });

  afterEach(async () => {
    __setPoolsForTests({});
    await db.close();
  });

  it("starts a new player with only idor unlocked", async () => {
    const userId = await createUser(db, "player_one");
    await initializeProgress(userId);

    const progress = await getProgress(userId);
    const byKey = Object.fromEntries(progress.map((p) => [p.key, p]));
    expect(byKey.idor!.unlocked).toBe(true);
    expect(byKey.sqli!.unlocked).toBe(false);
    expect(byKey.xss!.unlocked).toBe(false);
    expect(byKey.idor!.completedAt).toBeNull();
  });

  it("denies access to a locked challenge", async () => {
    const userId = await createUser(db, "player_two");
    await initializeProgress(userId);

    await expect(requireChallengeAccess(userId, "sqli")).rejects.toBeInstanceOf(
      ChallengeAccessError,
    );
  });

  it("allows access to an unlocked challenge", async () => {
    const userId = await createUser(db, "player_three");
    await initializeProgress(userId);
    await expect(
      requireChallengeAccess(userId, "idor"),
    ).resolves.toBeUndefined();
  });

  it("completing idor unlocks sqli but not xss", async () => {
    const userId = await createUser(db, "player_four");
    await initializeProgress(userId);

    const justCompleted = await completeChallenge(userId, "idor");
    expect(justCompleted).toBe(true);

    const progress = await getProgress(userId);
    const byKey = Object.fromEntries(progress.map((p) => [p.key, p]));
    expect(byKey.idor!.completedAt).not.toBeNull();
    expect(byKey.sqli!.unlocked).toBe(true);
    expect(byKey.xss!.unlocked).toBe(false);

    await expect(requireChallengeAccess(userId, "xss")).rejects.toBeInstanceOf(
      ChallengeAccessError,
    );
  });

  it("completing a challenge twice is idempotent (no double-unlock side effects)", async () => {
    const userId = await createUser(db, "player_five");
    await initializeProgress(userId);

    expect(await completeChallenge(userId, "idor")).toBe(true);
    expect(await completeChallenge(userId, "idor")).toBe(false);
  });

  it("still blocks a later challenge even if unlocked flag is desynced (defense in depth)", async () => {
    const userId = await createUser(db, "player_six");
    await initializeProgress(userId);
    // Simulate a desynced unlocked flag without completing the prerequisite.
    await db.appPool.query(
      "UPDATE challenge_progress SET unlocked = true WHERE user_id = $1 AND challenge_key = 'sqli'",
      [userId],
    );
    await expect(requireChallengeAccess(userId, "sqli")).rejects.toBeInstanceOf(
      ChallengeAccessError,
    );
  });

  it("reset (re-initialize) locks everything except idor again", async () => {
    const userId = await createUser(db, "player_seven");
    await initializeProgress(userId);
    await completeChallenge(userId, "idor");
    await completeChallenge(userId, "sqli");

    await initializeProgress(userId);
    const progress = await getProgress(userId);
    const byKey = Object.fromEntries(progress.map((p) => [p.key, p]));
    expect(byKey.idor!.unlocked).toBe(true);
    expect(byKey.idor!.completedAt).toBeNull();
    expect(byKey.sqli!.unlocked).toBe(false);
  });
});
