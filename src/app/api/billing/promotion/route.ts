import { NextResponse } from "next/server";
import { requireSessionWithCsrf } from "@/lib/security/api-guard";
import {
  InvalidPromotionCodeError,
  redeemPromotion,
} from "@/lib/billing/promotions";

const MAX_REQUEST_BODY_LENGTH = 256;

export async function POST(request: Request) {
  const guard = await requireSessionWithCsrf(request);
  if (!guard.ok) return guard.response;

  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_REQUEST_BODY_LENGTH
    ) {
      throw new InvalidPromotionCodeError();
    }

    const bodyText = await request.text();
    if (bodyText.length > MAX_REQUEST_BODY_LENGTH) {
      throw new InvalidPromotionCodeError();
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new InvalidPromotionCodeError();
    }
    const code =
      typeof body === "object" && body !== null && "code" in body
        ? (body as { code?: unknown }).code
        : undefined;
    const redemption = await redeemPromotion(guard.user.id, code);

    return NextResponse.json({
      success: true,
      promotionIdentifier: redemption.promotionIdentifier,
      alreadyRedeemed: !redemption.newlyGranted,
    });
  } catch (error) {
    if (error instanceof InvalidPromotionCodeError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Promotion redemption failed.");
    return NextResponse.json(
      { error: "Unable to redeem promotion code." },
      { status: 500 },
    );
  }
}
