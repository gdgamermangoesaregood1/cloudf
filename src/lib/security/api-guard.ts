import { NextResponse } from "next/server";
import {
  getCurrentSession,
  type AuthedUser,
  type SessionRecord,
} from "@/lib/auth/session";
import { verifyCsrf } from "@/lib/security/csrf";

export type Guarded =
  | { ok: true; user: AuthedUser; session: SessionRecord }
  | { ok: false; response: NextResponse };

/** Requires a valid session. Use for GET/read endpoints that need auth but do not mutate state. */
export async function requireSession(): Promise<Guarded> {
  const current = await getCurrentSession();
  if (!current) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 },
      ),
    };
  }
  return { ok: true, user: current.user, session: current.session };
}

/** Requires a valid session AND a valid CSRF token. Use for any state-changing (POST/PUT/DELETE) endpoint. */
export async function requireSessionWithCsrf(
  request: Request,
): Promise<Guarded> {
  const current = await getCurrentSession();
  if (!current) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 },
      ),
    };
  }
  if (!verifyCsrf(request, current.session)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or missing CSRF token." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user: current.user, session: current.session };
}
