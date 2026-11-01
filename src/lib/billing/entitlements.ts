import { getAppPool, type DbClient } from "@/lib/db/pool";

export const TRIAL_DAYS = 15;
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

export type EntitlementSource = "trial" | "subscription" | "promotion" | "none";

export interface Entitlement {
  active: boolean;
  source: EntitlementSource;
  trialStartedAt: Date;
  trialEndsAt: Date;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  promotionIdentifier: string | null;
}

export function hasPremiumBenefits(
  entitlement: Pick<Entitlement, "source" | "subscriptionStatus">,
): boolean {
  return (
    entitlement.source === "promotion" ||
    (entitlement.source === "subscription" &&
      entitlement.subscriptionStatus === "active")
  );
}

export class EntitlementRequiredError extends Error {
  readonly status = 403;

  constructor() {
    super("Your trial has ended. Subscribe to access challenges.");
  }
}

export async function initializeRegistrationTrial(
  userId: string,
  client: Pick<DbClient, "query"> = getAppPool(),
): Promise<void> {
  await client.query(
    `UPDATE users
     SET trial_started_at = now(),
         trial_ends_at = now() + ($2 * interval '1 day')
     WHERE id = $1`,
    [userId, TRIAL_DAYS],
  );
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const result = await getAppPool().query<{
    trial_started_at: Date;
    trial_ends_at: Date;
    subscription_status: string | null;
    current_period_end: Date | null;
    cancel_at_period_end: boolean | null;
    promotion_identifier: string | null;
  }>(
    `SELECT u.trial_started_at, u.trial_ends_at,
            s.status AS subscription_status, s.current_period_end,
            s.cancel_at_period_end, p.promotion_identifier
     FROM users u
     LEFT JOIN LATERAL (
       SELECT status, current_period_end, cancel_at_period_end
       FROM billing_subscriptions
       WHERE user_id = u.id
       ORDER BY
         CASE WHEN status = ANY($2::text[]) THEN 0 ELSE 1 END,
         updated_at DESC
       LIMIT 1
     ) s ON true
     LEFT JOIN promotion_grants p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId, [...ACTIVE_SUBSCRIPTION_STATUSES]],
  );
  const row = result.rows[0];
  if (!row) throw new Error("User entitlement record not found.");

  const trialStartedAt = new Date(row.trial_started_at);
  const trialEndsAt = new Date(row.trial_ends_at);
  const subscriptionActive =
    row.subscription_status !== null &&
    ACTIVE_SUBSCRIPTION_STATUSES.includes(
      row.subscription_status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number],
    );
  const paidSubscriptionActive = row.subscription_status === "active";
  const trialActive = trialEndsAt.getTime() > Date.now();
  const promotionActive = row.promotion_identifier !== null;

  return {
    active: subscriptionActive || promotionActive || trialActive,
    source: paidSubscriptionActive
      ? "subscription"
      : promotionActive
        ? "promotion"
        : subscriptionActive
          ? "subscription"
          : trialActive
            ? "trial"
            : "none",
    trialStartedAt,
    trialEndsAt,
    subscriptionStatus: row.subscription_status,
    currentPeriodEnd: row.current_period_end
      ? new Date(row.current_period_end)
      : null,
    cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    promotionIdentifier: row.promotion_identifier,
  };
}

export async function requireActiveEntitlement(userId: string): Promise<void> {
  const entitlement = await getEntitlement(userId);
  if (!entitlement.active) throw new EntitlementRequiredError();
}
