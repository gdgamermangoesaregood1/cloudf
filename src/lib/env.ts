import { z } from "zod";

/**
 * Centralized, validated environment configuration for the running Next.js
 * server. This intentionally excludes the Postgres *superuser* credentials —
 * those are only used by the one-off migration script (see db/migrate.ts),
 * never by the app server itself, so a compromised web process cannot use
 * elevated database privileges.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  SESSION_TTL_HOURS: z
    .string()
    .default("12")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(
      z
        .number()
        .int()
        .positive()
        .max(24 * 30),
    ),

  POSTGRES_HOST: z.string().min(1).default("localhost"),
  POSTGRES_PORT: z
    .string()
    .default("5432")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  POSTGRES_DB: z.string().min(1).default("security_training"),

  APP_DB_USER: z.string().min(1).default("app_role"),
  APP_DB_PASSWORD: z.string().min(1),
  SQLI_DB_USER: z.string().min(1).default("sqli_role"),
  SQLI_DB_PASSWORD: z.string().min(1),

  XSS_RENDER_TOKEN_TTL_MINUTES: z
    .string()
    .default("5")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive().max(60)),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Lazily validates and caches process.env. Throwing here (rather than at
 * import time in every module) keeps unit tests that mock env vars simple,
 * while still failing fast the first time the server actually needs config.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only helper to reset the memoized env between test cases. */
export function __resetEnvCacheForTests(): void {
  cached = undefined;
}
