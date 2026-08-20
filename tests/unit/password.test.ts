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
});
