import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-test-harness";
import { __setPoolsForTests } from "@/lib/db/pool";
import {
  completeCsrfLab,
  getContainedLabView,
  runContainedLab,
  seedContainedLabs,
} from "@/lib/challenges/contained-labs";
import { getProgress, initializeProgress } from "@/lib/challenges/progress";

async function createUser(db: TestDb): Promise<string> {
  const result = await db.appPool.query<{ id: string }>(
    "INSERT INTO users (username, password_hash) VALUES ('lab_player', 'hash') RETURNING id",
  );
  return result.rows[0]!.id;
}

describe("contained challenge simulators", () => {
  let db: TestDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    __setPoolsForTests({ appPool: db.appPool, sqliPool: db.sqliPool });
    userId = await createUser(db);
    await initializeProgress(userId);
    await seedContainedLabs(userId);
    await db.appPool.query(
      `UPDATE challenge_progress SET unlocked = true, completed_at = CASE
         WHEN sort_order < 5 THEN now() ELSE completed_at END
       WHERE user_id = $1`,
      [userId],
    );
  });

  afterEach(async () => {
    __setPoolsForTests({});
    await db.close();
  });

  it("completes the API IDOR lab and unlocks SSRF", async () => {
    const harmless = await runContainedLab(userId, "api-idor", "4101");
    expect(harmless.completed).toBe(false);
    expect(harmless.output).not.toContain("FLAG-");

    const exploit = await runContainedLab(userId, "api-idor", "4102");
    expect(exploit.completed).toBe(true);
    expect(exploit.output).toContain("FLAG-API-IDOR-");

    const progress = await getProgress(userId);
    expect(progress.find((row) => row.key === "ssrf")?.unlocked).toBe(true);
  });

  it("simulates command injection without starting a process", async () => {
    await db.appPool.query(
      `UPDATE challenge_progress SET unlocked = true, completed_at = CASE
         WHEN sort_order < 8 THEN now() ELSE completed_at END
       WHERE user_id = $1`,
      [userId],
    );
    const result = await runContainedLab(
      userId,
      "command-injection",
      "localhost; cat /opt/lab/flag",
    );
    expect(result.completed).toBe(true);
    expect(result.output).toContain("FLAG-COMMAND-INJECTION-");
  });

  it("exposes only a synthetic diagnostic value for exceptional input", async () => {
    const view = await getContainedLabView(userId, "exception-handling");
    expect(view.evidence).not.toContain("FLAG-");

    const result = await runContainedLab(
      userId,
      "exception-handling",
      "not-a-number",
    );
    expect(result.completed).toBe(false);
    expect(result.output).toContain("SyntheticReportService");
    expect(result.output).toContain("FLAG-EXCEPTION-HANDLING-");
  });

  it("generates different cryptographic challenge ciphertext per player", async () => {
    const secondResult = await db.appPool.query<{ id: string }>(
      "INSERT INTO users (username, password_hash) VALUES ('second_player', 'hash') RETURNING id",
    );
    const secondUserId = secondResult.rows[0]!.id;
    await initializeProgress(secondUserId);
    await seedContainedLabs(secondUserId);

    const first = await getContainedLabView(userId, "crypto-failure");
    const second = await getContainedLabView(secondUserId, "crypto-failure");
    expect(first.evidence).not.toBe(second.evidence);
  });

  it("supports every advanced exploit in curriculum order", async () => {
    await db.appPool.query(
      `UPDATE challenge_progress
       SET unlocked = sort_order <= 4,
           completed_at = CASE WHEN sort_order < 4 THEN now() ELSE NULL END
       WHERE user_id = $1`,
      [userId],
    );

    expect(await completeCsrfLab(userId)).toBe(true);
    const firstPayloads = [
      ["api-idor", "4102"],
      ["ssrf", "http://metadata.lab/latest/flag"],
      ["file-inclusion", "../../etc/lab-secret"],
      ["command-injection", "localhost; cat /opt/lab/flag"],
      [
        "xxe",
        '<!DOCTYPE report [<!ENTITY flag SYSTEM "file:///opt/lab/flag">]><report>&flag;</report>',
      ],
      ["template-injection", "{{config.FLAG}}"],
    ] as const;

    for (const [key, payload] of firstPayloads) {
      const result = await runContainedLab(userId, key, payload);
      expect(result.completed, key).toBe(true);
    }

    const crypto = await db.appPool.query<{ secret_flag: string }>(
      `SELECT secret_flag FROM contained_challenge_state
       WHERE user_id = $1 AND challenge_key = 'crypto-failure'`,
      [userId],
    );
    const cryptoResult = await runContainedLab(
      userId,
      "crypto-failure",
      crypto.rows[0]!.secret_flag,
    );
    expect(cryptoResult.completed).toBe(true);

    const finalPayloads = [
      ["security-misconfiguration", "/.env.backup"],
      ["auth-failure", "admin-session"],
      ["supply-chain", "telemetry-helper"],
    ] as const;
    for (const [key, payload] of finalPayloads) {
      const result = await runContainedLab(userId, key, payload);
      expect(result.completed, key).toBe(true);
    }

    const leak = await runContainedLab(
      userId,
      "exception-handling",
      "not-a-number",
    );
    const leakedFlag = leak.output.match(/FLAG-EXCEPTION-HANDLING-[a-f0-9]+/)?.[0];
    expect(leakedFlag).toBeDefined();
    const final = await runContainedLab(
      userId,
      "exception-handling",
      leakedFlag!,
    );
    expect(final.completed).toBe(true);

    const progress = await getProgress(userId);
    expect(
      progress
        .filter((row) => row.order <= 15)
        .every((row) => row.completedAt !== null),
    ).toBe(true);
    expect(
      progress.find((row) => row.key === "mass-assignment")?.unlocked,
    ).toBe(true);
  });
});
