import { describe, it, expect } from "vitest";
import { createTestDb } from "./db-test-harness";
import { __setPoolsForTests, withSqliUserContext } from "@/lib/db/pool";

describe("db test harness sanity", () => {
  it("migrates cleanly and enforces the sqli_role/app_role privilege boundary", async () => {
    const db = await createTestDb();
    __setPoolsForTests({ appPool: db.appPool, sqliPool: db.sqliPool });
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

      const scoped = await withSqliUserContext(userId, (client) =>
        client.query<{ title: string }>("SELECT title FROM items"),
      );
      expect(scoped.rows).toHaveLength(1);

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
      __setPoolsForTests({});
      await db.close();
    }
  });
});
