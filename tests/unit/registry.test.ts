import { describe, it, expect } from "vitest";
import {
  CHALLENGES,
  getChallengeMeta,
  nextChallengeKey,
} from "@/lib/challenges/registry";

describe("challenge registry", () => {
  it("defines all thirty challenges in a fixed sequential order", () => {
    expect(CHALLENGES.map((c) => c.key)).toEqual([
      "idor",
      "sqli",
      "xss",
      "csrf",
      "api-idor",
      "ssrf",
      "file-inclusion",
      "command-injection",
      "xxe",
      "template-injection",
      "crypto-failure",
      "security-misconfiguration",
      "auth-failure",
      "supply-chain",
      "exception-handling",
      "mass-assignment",
      "open-redirect",
      "cors-misconfiguration",
      "jwt-confusion",
      "nosql-injection",
      "graphql-authorization",
      "coupon-race",
      "prototype-pollution",
      "deserialization",
      "request-smuggling",
      "cache-poisoning",
      "host-header-injection",
      "oauth-failure",
      "websocket-authorization",
      "capstone",
    ]);
    expect(CHALLENGES.map((c) => c.order)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
  });

  it("computes the next challenge key in sequence", () => {
    expect(nextChallengeKey("idor")).toBe("sqli");
    expect(nextChallengeKey("sqli")).toBe("xss");
    expect(nextChallengeKey("xss")).toBe("csrf");
    expect(nextChallengeKey("exception-handling")).toBe("mass-assignment");
    expect(nextChallengeKey("capstone")).toBeUndefined();
  });

  it("provides complete solution metadata for every challenge", () => {
    expect(CHALLENGES).toHaveLength(30);
    for (const challenge of CHALLENGES) {
      expect(challenge.solution.answer.trim()).not.toBe("");
      expect(challenge.solution.explanation.trim()).not.toBe("");
      expect(challenge.solution.remediation.trim()).not.toBe("");
    }
  });

  it("throws for an unknown key", () => {
    // @ts-expect-error intentionally invalid input
    expect(() => getChallengeMeta("not-real")).toThrow();
  });
});
