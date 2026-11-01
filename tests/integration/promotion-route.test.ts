import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { createTestDb, type TestDb } from "./db-test-harness";
import { __setPoolsForTests } from "@/lib/db/pool";

const { requireSessionWithCsrf } = vi.hoisted(() => ({
  requireSessionWithCsrf: vi.fn(),
}));

vi.mock("@/lib/security/api-guard", () => ({ requireSessionWithCsrf }));

import { POST } from "@/app/api/billing/promotion/route";

describe("promotion redemption API", () => {
  let db: TestDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    __setPoolsForTests({ appPool: db.appPool, sqliPool: db.sqliPool });
    const user = await db.appPool.query<{ id: string }>(
      "INSERT INTO users (username, password_hash) VALUES ('promo_api', 'hash') RETURNING id",
    );
    userId = user.rows[0]!.id;
    requireSessionWithCsrf.mockResolvedValue({
      ok: true,
      user: { id: userId, username: "promo_api" },
      session: {
        id: "session-id",
        userId,
        csrfSecret: "csrf",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
  });

  afterEach(async () => {
    requireSessionWithCsrf.mockReset();
    __setPoolsForTests({});
    await db.close();
  });

  it("uses the authenticated CSRF guard and redeems a code", async () => {
    const request = new Request("http://localhost:3000/api/billing/promotion", {
      method: "POST",
      body: JSON.stringify({ code: "  DUCK " }),
    });
    const response = await POST(request);

    expect(requireSessionWithCsrf).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      promotionIdentifier: "duck",
      alreadyRedeemed: false,
    });
  });

  it("returns the authentication or CSRF guard response unchanged", async () => {
    requireSessionWithCsrf.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or missing CSRF token." },
        { status: 403 },
      ),
    });

    const response = await POST(
      new Request("http://localhost:3000/api/billing/promotion", {
        method: "POST",
        body: JSON.stringify({ code: "duck" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(
      (await db.appPool.query("SELECT user_id FROM promotion_grants")).rows,
    ).toHaveLength(0);
  });

  it("rejects invalid, malformed, and oversized requests generically", async () => {
    for (const body of [
      JSON.stringify({ code: "goose" }),
      "{",
      JSON.stringify({ code: "x".repeat(65) }),
      " ".repeat(257),
    ]) {
      const response = await POST(
        new Request("http://localhost:3000/api/billing/promotion", {
          method: "POST",
          body,
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid promotion code.",
      });
    }
  });
});
