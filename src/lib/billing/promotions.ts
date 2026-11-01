import { getAppPool } from "@/lib/db/pool";

export const DUCK_PROMOTION_IDENTIFIER = "duck";
export const MAX_PROMOTION_CODE_LENGTH = 64;

export class InvalidPromotionCodeError extends Error {
  readonly status = 400;

  constructor() {
    super("Invalid promotion code.");
  }
}

export interface PromotionRedemption {
  promotionIdentifier: string;
  newlyGranted: boolean;
}

export function normalizePromotionCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_PROMOTION_CODE_LENGTH) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === DUCK_PROMOTION_IDENTIFIER ? normalized : null;
}

export async function redeemPromotion(
  userId: string,
  submittedCode: unknown,
): Promise<PromotionRedemption> {
  const promotionIdentifier = normalizePromotionCode(submittedCode);
  if (!promotionIdentifier) throw new InvalidPromotionCodeError();

  const result = await getAppPool().query<{ promotion_identifier: string }>(
    `INSERT INTO promotion_grants (user_id, promotion_identifier)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING promotion_identifier`,
    [userId, promotionIdentifier],
  );

  return {
    promotionIdentifier,
    newlyGranted: result.rows.length === 1,
  };
}
