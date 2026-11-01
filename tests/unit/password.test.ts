import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing (argon2id)", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correct-horse-battery-staple")).toBe(
      true,
    );
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const a = await hashPassword("same-password-123");
    const b = await hashPassword("same-password-123");
    expect(a).not.toBe(b);
  });

  it("returns false rather than throwing for a malformed hash", async () => {
    await expect(verifyPassword("not-a-real-hash", "whatever")).resolves.toBe(
      false,
    );
  });

  it.each([
    [
      "legacy-password-123",
      "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$GGlo5sAbi3HlpPRI3SRias6K37xkovZbLcgImjwbeG0",
    ],
    [
      "p\u00e4ss\u{1f510}word",
      "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$oE8837mS57u8cVwCwf+lm6yryWbmRJEAkX7TsOw8F/A",
    ],
  ])("verifies a legacy native Argon2 hash for %s", async (password, hash) => {
    expect(await verifyPassword(hash, password)).toBe(true);
    expect(await verifyPassword(hash, `${password}-wrong`)).toBe(false);
  });

  it("rejects unsupported cost parameters without allocating their memory", async () => {
    const hash =
      "$argon2id$v=19$m=1048576,t=99,p=1$MDEyMzQ1Njc4OWFiY2RlZg$GGlo5sAbi3HlpPRI3SRias6K37xkovZbLcgImjwbeG0";
    expect(await verifyPassword(hash, "legacy-password-123")).toBe(false);
  });
});
