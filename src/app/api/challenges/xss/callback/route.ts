import { NextResponse } from "next/server";
import { getValidRenderToken, submitCallback } from "@/lib/challenges/xss";
import { getEntitlement } from "@/lib/billing/entitlements";

/**
 * The "safe server callback" a successful stored-XSS payload calls to prove
 * it executed and exfiltrated the per-render flag. Deliberately does NOT
 * rely on cookies or any session — the sandboxed iframe (sandbox="allow-
 * scripts", no allow-same-origin) has an opaque origin and cannot present
 * any ambient credentials. Authentication here is purely knowledge-based:
 * a one-time-use, short-lived render token plus the exact flag value that
 * was only ever visible inside that specific rendered frame.
 *
 * A plain GET is used intentionally (a "simple request" per the Fetch
 * spec/CORS), matching how a real exfiltration payload would behave (e.g.
 * an <img> beacon), and requires no custom headers or CSRF token — the
 * one-time token IS the anti-replay protection.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rt = url.searchParams.get("rt");
  const flag = url.searchParams.get("flag");

  if (!rt || !flag) {
    return NextResponse.json(
      { success: false, reason: "Missing rt or flag." },
      { status: 400 },
    );
  }
  const record = await getValidRenderToken(rt);
  if (!record || !(await getEntitlement(record.userId)).active) {
    return NextResponse.json(
      { success: false, reason: "Active challenge access is required." },
      { status: 403 },
    );
  }

  const outcome = await submitCallback(rt, flag);
  return NextResponse.json(outcome, {
    status: outcome.success ? 200 : 400,
    headers: {
      // Allows the sandboxed (opaque-origin) script to read this response
      // for in-page feedback; the payload carries no sensitive data.
      "Access-Control-Allow-Origin": "null",
      "Cache-Control": "no-store",
    },
  });
}
