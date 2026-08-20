import { describe, it, expect } from "vitest";
import {
  generateOpaqueToken,
  generateShortToken,
  sha256Hex,
  safeEqual,
} from "@/lib/auth/tokens";

describe("tokens", () => {
  it("generates unique, sufficiently long opaque tokens", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("generates shorter render tokens", () => {
    const t = generateShortToken();
    expect(t.length).toBeGreaterThan(10);
    expect(t.length).toBeLessThan(30);
  });

  it("sha256Hex is deterministic", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
    expect(sha256Hex("hello")).not.toBe(sha256Hex("world"));
  });

  it("safeEqual matches equal strings and rejects different ones", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
