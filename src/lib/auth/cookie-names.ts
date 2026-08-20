/**
 * Cookie name constants live in their own dependency-free module so that
 * src/middleware.ts (which runs on the Edge runtime) can import just the
 * names without pulling in node:crypto / pg / next/headers — importing
 * those from the full session module would break the Edge bundle.
 */
export const SESSION_COOKIE = "session";
export const CSRF_COOKIE = "csrf_token";
