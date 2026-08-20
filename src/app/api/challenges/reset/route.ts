import { NextResponse } from "next/server";
import { requireSessionWithCsrf } from "@/lib/security/api-guard";
import { getAppPool } from "@/lib/db/pool";
import { initializeProgress } from "@/lib/challenges/progress";
import { generateIdorWorld } from "@/lib/challenges/idor";
import { seedSqliItems } from "@/lib/challenges/sqli";

/**
 * Resets a player back to a fresh start: wipes and regenerates their IDOR
 * world and SQLi flags, clears their guestbook message/XSS render tokens,
 * and re-locks everything except the first challenge. Scoped entirely by
 * the authenticated user's own id — cannot affect any other player.
 */
export async function POST(request: Request) {
  const guard = await requireSessionWithCsrf(request);
  if (!guard.ok) return guard.response;
  const userId = guard.user.id;

  try {
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await initializeProgress(userId, client);
      await generateIdorWorld(userId, client);
      await seedSqliItems(userId, client);
      await client.query("DELETE FROM xss_messages WHERE user_id = $1", [
        userId,
      ]);
      await client.query("DELETE FROM xss_render_tokens WHERE user_id = $1", [
        userId,
      ]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Reset failed:", err);
    return NextResponse.json(
      { error: "Reset failed. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
