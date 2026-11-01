import { NextResponse } from "next/server";
import {
  completeCsrfLab,
  isContainedChallengeKey,
  runContainedLab,
} from "@/lib/challenges/contained-labs";
import {
  isAdvancedChallengeKey,
  runAdvancedLab,
} from "@/lib/challenges/advanced-labs";
import {
  ChallengeAccessError,
  requireChallengeAccess,
} from "@/lib/challenges/progress";
import {
  requireSession,
  requireSessionWithCsrf,
} from "@/lib/security/api-guard";
import { requireApiEntitlement } from "@/lib/billing/api-guard";

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { key } = await context.params;
  if (key !== "csrf") {
    return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
  }
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  const entitlementResponse = await requireApiEntitlement(guard.user.id);
  if (entitlementResponse) return entitlementResponse;
  try {
    await requireChallengeAccess(guard.user.id, "csrf");
  } catch (error) {
    if (error instanceof ChallengeAccessError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
  const action = new URL(request.url).searchParams.get("action");
  if (action !== "disable-alerts") {
    return NextResponse.json(
      { error: "Unknown legacy action.", currentSetting: "alerts-enabled" },
      { status: 400 },
    );
  }
  const justCompleted = await completeCsrfLab(guard.user.id);
  return NextResponse.json({
    success: true,
    setting: "alerts-disabled",
    vulnerability: "State changed through GET without a CSRF token.",
    justCompleted,
    next: "/dashboard",
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { key } = await context.params;
  if (
    (!isContainedChallengeKey(key) && !isAdvancedChallengeKey(key)) ||
    key === "csrf"
  ) {
    return NextResponse.json(
      { error: "Challenge not found." },
      { status: 404 },
    );
  }
  const guard = await requireSessionWithCsrf(request);
  if (!guard.ok) return guard.response;
  const entitlementResponse = await requireApiEntitlement(guard.user.id);
  if (entitlementResponse) return entitlementResponse;
  try {
    await requireChallengeAccess(guard.user.id, key);
  } catch (error) {
    if (error instanceof ChallengeAccessError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const input =
    typeof body === "object" &&
    body !== null &&
    "input" in body &&
    typeof body.input === "string"
      ? body.input
      : null;
  if (input === null || input.length > 8000) {
    return NextResponse.json(
      { error: "Input must be a string no longer than 8000 characters." },
      { status: 400 },
    );
  }

  const result = isAdvancedChallengeKey(key)
    ? await runAdvancedLab(guard.user.id, key, input)
    : await runContainedLab(guard.user.id, key, input);
  return NextResponse.json(result);
}
