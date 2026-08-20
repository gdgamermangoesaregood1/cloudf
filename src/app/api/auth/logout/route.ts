import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/auth/session";
import { requireSessionWithCsrf } from "@/lib/security/api-guard";

export async function POST(request: Request) {
  const guard = await requireSessionWithCsrf(request);
  if (!guard.ok) return guard.response;

  await destroyCurrentSession();
  return NextResponse.json({ success: true });
}
