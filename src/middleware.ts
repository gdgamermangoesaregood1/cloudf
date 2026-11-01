import { NextResponse, type NextRequest } from "next/server";
import { BASE_SECURITY_HEADERS, buildAppCsp } from "@/lib/security/headers";
import { SESSION_COOKIE } from "@/lib/auth/cookie-names";

const PROTECTED_PREFIXES = ["/dashboard", "/challenges", "/billing"];
const GUEST_ONLY_PATHS = ["/login", "/register"];

/**
 * Proxy/middleware runs on the Edge runtime and must stay database-free, so
 * it only performs an *optimistic* redirect based on cookie presence (per
 * Next.js's recommended auth pattern). The authoritative check — is this
 * session actually valid, and is this specific challenge unlocked for this
 * user — always happens server-side in the page/route handler itself
 * (see src/lib/challenges/access.ts), which is the only place that can
 * safely talk to the database.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const nonce = btoa(crypto.randomUUID());
  const csp = buildAppCsp(nonce);

  if (
    PROTECTED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    ) &&
    !hasSessionCookie
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return applyHeaders(NextResponse.redirect(url), pathname, csp);
  }

  if (GUEST_ONLY_PATHS.includes(pathname) && hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return applyHeaders(NextResponse.redirect(url), pathname, csp);
  }

  const requestHeaders = new Headers(request.headers);
  // Next.js reads both headers to attach the nonce to its inline bootstrap
  // scripts while rendering the response.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  return applyHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    pathname,
    csp,
  );
}

function applyHeaders(
  response: NextResponse,
  pathname: string,
  csp: string,
): NextResponse {
  // The stored-XSS sandbox document sets its own, much more restrictive CSP
  // in its route handler (buildXssFrameCsp) — do not overwrite it here.
  if (!pathname.startsWith("/api/challenges/xss/frame")) {
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("X-Frame-Options", "DENY");
  }
  for (const [key, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets, so headers apply to pages and
     * API routes alike.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
