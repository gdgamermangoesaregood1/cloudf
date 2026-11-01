import { NextResponse } from "next/server";
import { requireSessionWithCsrf } from "@/lib/security/api-guard";
import {
  requireChallengeAccess,
  ChallengeAccessError,
} from "@/lib/challenges/progress";
import { saveMessage } from "@/lib/challenges/xss";
import { z } from "zod";
import { requireApiEntitlement } from "@/lib/billing/api-guard";

const bodySchema = z.object({
  content: z.string().max(4000, "Message is too long."),
});

export async function POST(request: Request) {
  const guard = await requireSessionWithCsrf(request);
  if (!guard.ok) return guard.response;
  const entitlementResponse = await requireApiEntitlement(guard.user.id);
  if (entitlementResponse) return entitlementResponse;

  try {
    await requireChallengeAccess(guard.user.id, "xss");
  } catch (err) {
    if (err instanceof ChallengeAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed." }, { status: 400 });
  }

  // Intentionally stored verbatim, without sanitization — the stored-XSS
  // payload for this challenge. It is only ever rendered back inside the
  // sandboxed, CSP-locked-down iframe route (/api/challenges/xss/frame).
  await saveMessage(guard.user.id, parsed.data.content);

  return NextResponse.json({ success: true });
}
