const isProd = process.env.NODE_ENV === "production";

/**
 * Strict CSP for all normal application pages/APIs. Notably:
 *  - script-src has no 'unsafe-inline'/'unsafe-eval' in production (dev
 *    needs 'unsafe-eval' for React Fast Refresh's eval-based source maps).
 *  - frame-src 'self' only, so the app may embed its OWN sandboxed XSS
 *    challenge frame, but nothing else.
 *  - frame-ancestors 'none': the app itself must never be framed by anyone,
 *    including itself, which also fully rules out clickjacking.
 */
export function buildAppCsp(): string {
  const scriptSrc = isProd ? "'self'" : "'self' 'unsafe-eval'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * CSP for the sandboxed stored-XSS render document only. This document is
 * expected to run attacker/player-controlled inline script (that's the
 * point of the challenge) but:
 *  - cannot load or exfiltrate to any third-party origin (default-src
 *    'none', connect-src 'self' only reaches our own callback endpoint),
 *  - can only ever be framed by our own top-level app (frame-ancestors
 *    'self'), never embedded elsewhere,
 *  - is additionally constrained by the parent's <iframe sandbox="...">
 *    attribute (no `allow-same-origin`), which gives it an opaque origin
 *    with no access to cookies, storage, or the parent DOM regardless of
 *    this CSP.
 */
export function buildXssFrameCsp(): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/** Common hardening headers applied to every response. */
export const BASE_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};
