import { NextResponse, type NextRequest } from "next/server";
import { getAppPool } from "@/lib/db/pool";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionAndSetCookies } from "@/lib/auth/session";
import { loginSchema } from "@/lib/auth/validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/client-ip";

// A fixed, non-secret dummy hash avoids randomness and costly hashing during
// Worker startup while retaining password-verification timing on misses.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$GGlo5sAbi3HlpPRI3SRias6K37xkovZbLcgImjwbeG0";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const ipLimit = checkRateLimit(`login:ip:${ip}`, {
    max: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 400 },
    );
  }
  const { username, password } = parsed.data;

  const userLimit = checkRateLimit(`login:user:${username.toLowerCase()}`, {
    max: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!userLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many login attempts for this account. Please try again later.",
      },
      { status: 429 },
    );
  }

  let user: { id: string; password_hash: string } | undefined;
  try {
    const result = await getAppPool().query<{
      id: string;
      password_hash: string;
    }>("SELECT id, password_hash FROM users WHERE username = $1", [username]);
    user = result.rows[0];
  } catch (err) {
    console.error("Login lookup failed:", err);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 },
    );
  }

  if (!user) {
    await verifyPassword(DUMMY_HASH, password);
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  }

  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  }

  await createSessionAndSetCookies(user.id);
  return NextResponse.json({ username }, { status: 200 });
}
