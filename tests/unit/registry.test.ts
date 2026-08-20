import { describe, it, expect } from "vitest";
import {
  CHALLENGES,
  getChallengeMeta,
  nextChallengeKey,
} from "@/lib/challenges/registry";

describe("challenge registry", () => {
  it("defines the three challenges in a fixed sequential order", () => {
    expect(CHALLENGES.map((c) => c.key)).toEqual(["idor", "sqli", "xss"]);
    expect(CHALLENGES.map((c) => c.order)).toEqual([1, 2, 3]);
  });

  it("computes the next challenge key in sequence", () => {
    expect(nextChallengeKey("idor")).toBe("sqli");
    expect(nextChallengeKey("sqli")).toBe("xss");
    expect(nextChallengeKey("xss")).toBeUndefined();
  });

  it("throws for an unknown key", () => {
    // @ts-expect-error intentionally invalid input
    expect(() => getChallengeMeta("not-real")).toThrow();
  });
});
