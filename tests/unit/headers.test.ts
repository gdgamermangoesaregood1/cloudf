import { describe, expect, it } from "vitest";
import { buildAppCsp, buildXssFrameCsp } from "@/lib/security/headers";

describe("security headers", () => {
  it("allows only nonce-bearing Next.js bootstrap scripts", () => {
    const csp = buildAppCsp("test-nonce");
    const scriptDirective = csp
      .split("; ")
      .find((directive) => directive.startsWith("script-src"));

    expect(scriptDirective).toContain(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic'",
    );
    expect(scriptDirective).not.toContain("'unsafe-inline'");
  });

  it("keeps the XSS challenge policy separate from the app nonce", () => {
    const csp = buildXssFrameCsp();

    expect(csp).toContain("script-src 'unsafe-inline'");
    expect(csp).toContain("default-src 'none'");
  });

  it("allows opaque sandbox callbacks only to the configured app origin", () => {
    const csp = buildXssFrameCsp("http://localhost:3000");

    expect(csp).toContain("connect-src http://localhost:3000");
    expect(csp).not.toContain("connect-src *");
  });
});
