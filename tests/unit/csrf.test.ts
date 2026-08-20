import { describe, it, expect } from "vitest";
import { verifyCsrf } from "@/lib/security/csrf";
import type { SessionRecord } from "@/lib/auth/session";

function makeSession(csrfSecret: string): SessionRecord {
  return {
    id: "s1",
    userId: "u1",
    csrfSecret,
    expiresAt: new Date(Date.now() + 100000),
  };
}

function makeRequest(opts: {
  origin?: string;
  cookie?: string;
  header?: string;
}): Request {
  const headers = new Headers();
  if (opts.origin !== undefined) headers.set("origin", opts.origin);
  if (opts.cookie !== undefined) headers.set("cookie", opts.cookie);
  if (opts.header !== undefined) headers.set("x-csrf-token", opts.header);
  return new Request("http://localhost:3000/api/whatever", {
    method: "POST",
    headers,
  });
}

describe("verifyCsrf", () => {
  it("accepts a matching same-origin request with cookie+header+session all aligned", () => {
    const session = makeSession("secret-abc");
    const req = makeRequest({
      origin: "http://localhost:3000",
      cookie: "csrf_token=secret-abc",
      header: "secret-abc",
    });
    expect(verifyCsrf(req, session)).toBe(true);
  });

  it("rejects when the header is missing", () => {
    const session = makeSession("secret-abc");
    const req = makeRequest({
      origin: "http://localhost:3000",
      cookie: "csrf_token=secret-abc",
    });
    expect(verifyCsrf(req, session)).toBe(false);
  });

  it("rejects when the cookie is missing", () => {
    const session = makeSession("secret-abc");
    const req = makeRequest({
      origin: "http://localhost:3000",
      header: "secret-abc",
    });
    expect(verifyCsrf(req, session)).toBe(false);
  });

  it("rejects when header and cookie disagree", () => {
    const session = makeSession("secret-abc");
    const req = makeRequest({
      origin: "http://localhost:3000",
      cookie: "csrf_token=different-value",
      header: "secret-abc",
    });
    expect(verifyCsrf(req, session)).toBe(false);
  });

  it("rejects when the token doesn't match the session's own csrf secret", () => {
    const session = makeSession("secret-abc");
    const req = makeRequest({
      origin: "http://localhost:3000",
      cookie: "csrf_token=stolen-token",
      header: "stolen-token",
    });
    expect(verifyCsrf(req, session)).toBe(false);
  });

  it("rejects a cross-origin request", () => {
    const session = makeSession("secret-abc");
    const req = makeRequest({
      origin: "https://evil.example",
      cookie: "csrf_token=secret-abc",
      header: "secret-abc",
    });
    expect(verifyCsrf(req, session)).toBe(false);
  });
});
