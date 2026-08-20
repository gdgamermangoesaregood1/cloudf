import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/** 256-bit random, URL-safe opaque token (used for session tokens & CSRF secrets). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 128-bit random, URL-safe token — used for short-lived XSS render tokens. */
export function generateShortToken(): string {
  return randomBytes(16).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Constant-time string comparison to avoid timing side channels. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
