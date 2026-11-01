import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { __resetEnvCacheForTests } from "@/lib/env";
import {
  __setPoolsForTests,
  closeAllPools,
  getAppPool,
  getSqliPool,
} from "@/lib/db/pool";

vi.mock("pg", () => ({
  Pool: vi.fn(() => ({
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

const originalMode = process.env.DB_POOL_MODE;
const originalSsl = process.env.POSTGRES_SSL;

beforeEach(async () => {
  await closeAllPools();
  __setPoolsForTests({});
  vi.clearAllMocks();
  __resetEnvCacheForTests();
});

afterEach(async () => {
  await closeAllPools();
  if (originalMode === undefined) delete process.env.DB_POOL_MODE;
  else process.env.DB_POOL_MODE = originalMode;
  if (originalSsl === undefined) delete process.env.POSTGRES_SSL;
  else process.env.POSTGRES_SSL = originalSsl;
  __resetEnvCacheForTests();
});

describe("database connection lifetimes", () => {
  it("does not share Worker pools and closes connections after one use", () => {
    process.env.DB_POOL_MODE = "single-use";
    process.env.POSTGRES_SSL = "require";

    expect(getAppPool()).not.toBe(getAppPool());
    expect(getSqliPool()).not.toBe(getSqliPool());
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "app_role",
        ssl: true,
        maxUses: 1,
      }),
    );
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "sqli_role",
        ssl: true,
        maxUses: 1,
      }),
    );
  });

  it("preserves separate reusable pools for local Node", () => {
    process.env.DB_POOL_MODE = "pooled";
    process.env.POSTGRES_SSL = "disable";

    expect(getAppPool()).toBe(getAppPool());
    expect(getSqliPool()).toBe(getSqliPool());
    expect(getAppPool()).not.toBe(getSqliPool());
    expect(Pool).toHaveBeenCalledTimes(2);
    for (const [options] of vi.mocked(Pool).mock.calls) {
      expect(options).not.toHaveProperty("maxUses");
      expect(options?.ssl).toBe(false);
    }
  });
});
