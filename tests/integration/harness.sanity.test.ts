import { describe, it, expect } from "vitest";
import { createTestDb } from "./db-test-harness";

describe("db test harness sanity", () => {
  it("migrates cleanly and enforces the sqli_role/app_role privilege boundary", async () => {
    const db = await createTestDb();
    try {
      const userId = "11111111-1111-1111-1111-111111111111";
      await db.ownerPool.query(
        "INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)",
        [userId, "harness_user", "hash"],
      );
      await db.ownerPool.query(
        "INSERT INTO sqli_challenge.items (user_id, title, description, secret_flag) VALUES ($1, $2, $3, $4)",
        [userId, "Item", "Desc", "FLAG-SQLI-abc123"],
      );

      // sqli_role can select its own scoped row once app.current_user_id is set
      // for the duration of a transaction (set_config's third arg = true means
      // "local to transaction", matching src/lib/db/pool.ts withSqliUserContext).
      const sqliClient = await db.sqliPool.connect();
      await sqliClient.query("BEGIN");
      await sqliClient.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [userId],
      );
      const scoped = await sqliClient.query<{ title: string }>(
        "SELECT title FROM items",
      );
      await sqliClient.query("COMMIT");
      expect(scoped.rows).toHaveLength(1);
      sqliClient.release();

      // sqli_role must never be able to read the users table.
      const sqliClient2 = await db.sqliPool.connect();
      await expect(
        sqliClient2.query("SELECT * FROM public.users"),
      ).rejects.toThrow();
      sqliClient2.release();

      // app_role must never be able to SELECT sqli_challenge.items (INSERT/UPDATE/DELETE only).
      const appClient = await db.appPool.connect();
      await expect(
        appClient.query("SELECT * FROM sqli_challenge.items"),
      ).rejects.toThrow();
      appClient.release();
    } finally {
      await db.close();
    }
  });
});
