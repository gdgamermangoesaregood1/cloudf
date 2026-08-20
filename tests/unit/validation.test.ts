import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  usernameSchema,
  passwordSchema,
} from "@/lib/auth/validation";

describe("validation schemas", () => {
  it("accepts a valid username", () => {
    expect(usernameSchema.safeParse("valid_user-1").success).toBe(true);
  });

  it("rejects a too-short username", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects usernames with disallowed characters", () => {
    expect(usernameSchema.safeParse("bad user!").success).toBe(false);
  });

  it("rejects short passwords", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
  });

  it("rejects common passwords", () => {
    expect(passwordSchema.safeParse("password123").success).toBe(false);
  });

  it("accepts a reasonable password", () => {
    expect(passwordSchema.safeParse("a-fairly-unique-passphrase").success).toBe(
      true,
    );
  });

  it("registerSchema rejects mismatched confirmPassword", () => {
    const result = registerSchema.safeParse({
      username: "newplayer",
      password: "a-fairly-unique-passphrase",
      confirmPassword: "different-passphrase",
    });
    expect(result.success).toBe(false);
  });

  it("registerSchema rejects password equal to username", () => {
    const result = registerSchema.safeParse({
      username: "sameasme12",
      password: "sameasme12",
      confirmPassword: "sameasme12",
    });
    expect(result.success).toBe(false);
  });

  it("registerSchema accepts a valid registration", () => {
    const result = registerSchema.safeParse({
      username: "newplayer",
      password: "a-fairly-unique-passphrase",
      confirmPassword: "a-fairly-unique-passphrase",
    });
    expect(result.success).toBe(true);
  });

  it("loginSchema requires non-empty fields", () => {
    expect(loginSchema.safeParse({ username: "", password: "" }).success).toBe(
      false,
    );
    expect(
      loginSchema.safeParse({ username: "a", password: "b" }).success,
    ).toBe(true);
  });
});
