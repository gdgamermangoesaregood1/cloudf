import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "./db-test-harness";
import { __setPoolsForTests } from "@/lib/db/pool";
import { initializeProgress } from "@/lib/challenges/progress";
import {
  generateIdorWorld,
  listPublicRecords,
  fetchRecordForPlayer,
} from "@/lib/challenges/idor";

async function createUser(db: TestDb, username: string): Promise<string> {
  const result = await db.appPool.query<{ id: string }>(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
    [username, "hash"],
  );
  return result.rows[0]!.id;
}

describe("IDOR challenge (broken object-level authorization within one's own world)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    __setPoolsForTests({ appPool: db.appPool, sqliPool: db.sqliPool });
  });

  afterEach(async () => {
    __setPoolsForTests({});
    await db.close();
  });

  it("only lists non-confidential records publicly", async () => {
    const userId = await createUser(db, "idor_player_1");
    await initializeProgress(userId);
    await generateIdorWorld(userId);

    const publicRecords = await listPublicRecords(userId);
    expect(publicRecords.length).toBeGreaterThan(0);
    expect(publicRecords.every((r) => !r.requiresClearance)).toBe(true);
  });

  it("the flaw: a normal player CAN read the confidential record within their own world by guessing the index", async () => {
    const userId = await createUser(db, "idor_player_2");
    await initializeProgress(userId);
    await generateIdorWorld(userId);

    const publicRecords = await listPublicRecords(userId);
    const nextIndex = publicRecords.length + 1; // one past the linked/public records

    const result = await fetchRecordForPlayer(userId, nextIndex);
    expect(result.found).toBe(true);
    expect(result.record?.requiresClearance).toBe(true);
    expect(result.record?.body).toMatch(/FLAG-IDOR-[0-9a-f]{16}/);
    expect(result.justCompleted).toBe(true);
  });

  it("is fully contained: another player can never reach the first player's world", async () => {
    const userA = await createUser(db, "idor_player_a");
    const userB = await createUser(db, "idor_player_b");
    await initializeProgress(userA);
    await initializeProgress(userB);
    await generateIdorWorld(userA);
    await generateIdorWorld(userB);

    const aRecords = await listPublicRecords(userA);
    const flagIndex = aRecords.length + 1;

    // Player B fetching "the same index" only ever sees player B's own
    // world (owner_id is always scoped to the caller), never A's data.
    const bResult = await fetchRecordForPlayer(userB, flagIndex);
    expect(bResult.found).toBe(true);

    const aResult = await fetchRecordForPlayer(userA, flagIndex);
    expect(aResult.record?.body).toMatch(/FLAG-IDOR-[0-9a-f]{16}/);
    expect(aResult.record?.body).not.toBe(bResult.record?.body);
  });

  it("returns not-found for an out-of-range record index", async () => {
    const userId = await createUser(db, "idor_player_3");
    await initializeProgress(userId);
    await generateIdorWorld(userId);

    const result = await fetchRecordForPlayer(userId, 999);
    expect(result.found).toBe(false);
  });
});
