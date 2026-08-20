import { NextResponse, type NextRequest } from "next/server";
import { getAppPool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createSessionAndSetCookies } from "@/lib/auth/session";
import { registerSchema } from "@/lib/auth/validation";
import { initializeProgress } from "@/lib/challenges/progress";
import { generateIdorWorld } from "@/lib/challenges/idor";
import { seedSqliItems } from "@/lib/challenges/sqli";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/client-ip";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`register:${ip}`, {
    max: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { username, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  let userId: string;
  try {
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertResult = await client.query<{ id: string }>(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
        [username, passwordHash],
      );
      userId = insertResult.rows[0]!.id;

      await initializeProgress(userId, client);
      await generateIdorWorld(userId, client);
      await seedSqliItems(userId, client);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 },
      );
    }
    console.error("Registration failed:", err);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 },
    );
  }

  await createSessionAndSetCookies(userId);
  return NextResponse.json({ username }, { status: 201 });
}
