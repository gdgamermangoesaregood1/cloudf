import { z } from "zod";

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwertyui",
  "letmein1",
  "iloveyou",
  "admin123",
  "welcome1",
  "changeme",
  "123123123",
  "111111111",
]);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be at most 32 characters.")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username may only contain letters, numbers, hyphens and underscores.",
  );

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(128, "Password must be at most 128 characters.")
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), {
    message: "That password is too common. Please choose a stronger one.",
  });

export const registerSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine(
    (data) => data.password.toLowerCase() !== data.username.toLowerCase(),
    {
      message: "Password must not be the same as your username.",
      path: ["password"],
    },
  );

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
