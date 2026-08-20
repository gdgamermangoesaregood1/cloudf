import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "./db-test-harness";
import { __setPoolsForTests } from "@/lib/db/pool";
import {
  initializeProgress,
  getProgress,
  completeChallenge,
} from "@/lib/challenges/progress";
import {
  saveMessage,
  getMessage,
  issueRenderToken,
  submitCallback,
} from "@/lib/challenges/xss";

async function createUser(db: TestDb, username: string): Promise<string> {
  const result = await db.appPool.query<{ id: string }>(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
    [username, "hash"],
  );
  return result.rows[0]!.id;
}

describe("stored XSS challenge (sandboxed render + one-time server callback)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    __setPoolsForTests({ appPool: db.appPool, sqliPool: db.sqliPool });
  });

  afterEach(async () => {
    __setPoolsForTests({});
    await db.close();
  });

  it("stores and returns the raw (unsanitized) message content", async () => {
    const userId = await createUser(db, "xss_player_1");
    await initializeProgress(userId);
    const payload = "<script>alert(1)</script>";
    await saveMessage(userId, payload);
    expect(await getMessage(userId)).toBe(payload);
  });

  it("a correct (token, flag) callback pair completes the challenge exactly once", async () => {
    const userId = await createUser(db, "xss_player_2");
    await initializeProgress(userId);
    await completeChallenge(userId, "idor");
    await completeChallenge(userId, "sqli");

    const { token } = await issueRenderToken(userId);
    const record = await db.appPool.query<{ flag: string }>(
      "SELECT flag FROM xss_render_tokens WHERE token = $1",
      [token],
    );
    const flag = record.rows[0]!.flag;

    const first = await submitCallback(token, flag);
    expect(first.success).toBe(true);
    expect(first.justCompleted).toBe(true);

    const progress = await getProgress(userId);
    expect(progress.find((p) => p.key === "xss")?.completedAt).not.toBeNull();

    // One-time use: replaying the same token must fail.
    const second = await submitCallback(token, flag);
    expect(second.success).toBe(false);
  });

  it("rejects a wrong flag value for a valid token", async () => {
    const userId = await createUser(db, "xss_player_3");
    await initializeProgress(userId);
    const { token } = await issueRenderToken(userId);

    const outcome = await submitCallback(token, "FLAG-XSS-0000000000000000");
    expect(outcome.success).toBe(false);
  });

  it("rejects an unknown token", async () => {
    const outcome = await submitCallback("nonexistent-token", "whatever");
    expect(outcome.success).toBe(false);
  });

  it("rejects an expired token", async () => {
    const userId = await createUser(db, "xss_player_4");
    await initializeProgress(userId);
    const { token } = await issueRenderToken(userId);
    const record = await db.appPool.query<{ flag: string }>(
      "SELECT flag FROM xss_render_tokens WHERE token = $1",
      [token],
    );
    const flag = record.rows[0]!.flag;

    // Force the token into the past directly (pglite's now() is real
    // wall-clock time, so we push expires_at back rather than mocking time).
    await db.appPool.query(
      "UPDATE xss_render_tokens SET expires_at = now() - interval '1 hour' WHERE token = $1",
      [token],
    );

    const outcome = await submitCallback(token, flag);
    expect(outcome.success).toBe(false);
  });
});
