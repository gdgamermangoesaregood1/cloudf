import { NextResponse } from "next/server";
import {
  EntitlementRequiredError,
  requireActiveEntitlement,
} from "@/lib/billing/entitlements";

export async function requireApiEntitlement(
  userId: string,
): Promise<NextResponse | null> {
  try {
    await requireActiveEntitlement(userId);
    return null;
  } catch (error) {
    if (error instanceof EntitlementRequiredError) {
      return NextResponse.json(
        { error: error.message, code: "ENTITLEMENT_REQUIRED" },
        { status: error.status },
      );
    }
    throw error;
  }
}
