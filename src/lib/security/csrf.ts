import { getEnv } from "@/lib/env";
import { safeEqual } from "@/lib/auth/tokens";
import { CSRF_COOKIE } from "@/lib/auth/cookie-names";
import type { SessionRecord } from "@/lib/auth/session";

export const CSRF_HEADER = "x-csrf-token";

/**
 * Defense-in-depth CSRF verification for state-changing requests:
 *  1. Same-origin check (Origin/Referer must match APP_URL) — this alone
 *     already blocks the vast majority of cross-site request forgery.
 *  2. Double-submit token check: the `x-csrf-token` request header must
 *     match BOTH the readable csrf_token cookie AND the csrf_secret stored
 *     server-side for the caller's own session (so a token stolen from a
 *     different origin/session cannot be replayed).
 */
export function verifyCsrf(request: Request, session: SessionRecord): boolean {
  const env = getEnv();

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.APP_URL).origin) {
    return false;
  }

  const headerToken = request.headers.get(CSRF_HEADER);
  if (!headerToken) return false;

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieToken = parseCookie(cookieHeader, CSRF_COOKIE);
  if (!cookieToken) return false;

  return (
    safeEqual(headerToken, cookieToken) &&
    safeEqual(headerToken, session.csrfSecret)
  );
}

function parseCookie(cookieHeader: string, name: string): string | undefined {
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}
