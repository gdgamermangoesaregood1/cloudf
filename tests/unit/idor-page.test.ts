import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("IDOR challenge interaction", () => {
  it("requires changing the recordIndex URL rather than using a number form", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "app", "challenges", "idor", "page.tsx"),
      "utf8",
    );

    expect(source).toContain("searchParams");
    expect(source).toContain("recordIndex");
    expect(source).not.toContain('name="recordIndex"');
    expect(source).not.toContain("<form");
  });
});
