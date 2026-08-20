import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  __resetRateLimitForTests,
} from "@/lib/security/rate-limit";

describe("rate limiter", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("allows requests under the limit", () => {
    const r1 = checkRateLimit("k", { max: 3, windowMs: 60_000 });
    const r2 = checkRateLimit("k", { max: 3, windowMs: 60_000 });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("blocks once the limit is exceeded", () => {
    checkRateLimit("k", { max: 2, windowMs: 60_000 });
    checkRateLimit("k", { max: 2, windowMs: 60_000 });
    const third = checkRateLimit("k", { max: 2, windowMs: 60_000 });
    expect(third.allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    checkRateLimit("a", { max: 1, windowMs: 60_000 });
    const b = checkRateLimit("b", { max: 1, windowMs: 60_000 });
    expect(b.allowed).toBe(true);
  });
});
