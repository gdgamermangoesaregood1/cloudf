import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db-test-harness";
import { __setPoolsForTests } from "@/lib/db/pool";
import {
  EntitlementRequiredError,
  getEntitlement,
  hasPremiumBenefits,
  initializeRegistrationTrial,
  requireActiveEntitlement,
  TRIAL_DAYS,
} from "@/lib/billing/entitlements";
import { processStripeEvent } from "@/lib/billing/reconcile";
import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { POST as webhookPost } from "@/app/api/billing/webhook/route";
import { POST as simulatePost } from "@/app/api/billing/simulate/[action]/route";
import { claimCheckoutAttempt } from "@/lib/billing/checkout";
import { seedContainedLabs } from "@/lib/challenges/contained-labs";
import PremiumSolutionGuide from "@/components/PremiumSolutionGuide";
import { renderToStaticMarkup } from "react-dom/server";
import {
  InvalidPromotionCodeError,
  MAX_PROMOTION_CODE_LENGTH,
  normalizePromotionCode,
  redeemPromotion,
} from "@/lib/billing/promotions";

async function createUser(db: TestDb, username: string): Promise<string> {
  const result = await db.appPool.query<{ id: string }>(
    "INSERT INTO users (username, password_hash) VALUES ($1, 'hash') RETURNING id",
    [username],
  );
  return result.rows[0]!.id;
}

function subscription(
  userId: string,
  status: Stripe.Subscription.Status = "active",
): Stripe.Subscription {
  return {
    id: "sub_test",
    object: "subscription",
    customer: "cus_test",
    metadata: { userId },
    status,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          price: { id: "price_test_4_month" },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

describe("billing entitlements and webhook persistence", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    __setPoolsForTests({ appPool: db.appPool, sqliPool: db.sqliPool });
  });

  afterEach(async () => {
    __setPoolsForTests({});
    await db.close();
  });

  it("initializes a 15-day registration trial", async () => {
    const userId = await createUser(db, "trial_player");
    await initializeRegistrationTrial(userId);
    const entitlement = await getEntitlement(userId);
    expect(entitlement.active).toBe(true);
    expect(entitlement.source).toBe("trial");
    expect(hasPremiumBenefits(entitlement)).toBe(false);
    expect(
      entitlement.trialEndsAt.getTime() - entitlement.trialStartedAt.getTime(),
    ).toBe(TRIAL_DAYS * 24 * 60 * 60 * 1000);
  });

  it("denies access after trial expiry without a subscription", async () => {
    const userId = await createUser(db, "expired_player");
    await db.appPool.query(
      "UPDATE users SET trial_ends_at = now() - interval '1 day' WHERE id = $1",
      [userId],
    );
    await expect(requireActiveEntitlement(userId)).rejects.toBeInstanceOf(
      EntitlementRequiredError,
    );
  });

  it("grants permanent premium for a normalized duck promotion", async () => {
    const userId = await createUser(db, "promoted_player");
    await db.appPool.query(
      "UPDATE users SET trial_ends_at = now() - interval '1 day' WHERE id = $1",
      [userId],
    );

    const redemption = await redeemPromotion(userId, " \tDuCk\r\n");
    const entitlement = await getEntitlement(userId);

    expect(redemption).toEqual({
      promotionIdentifier: "duck",
      newlyGranted: true,
    });

    expect(entitlement.active).toBe(true);
    expect(entitlement.source).toBe("promotion");
    expect(entitlement.promotionIdentifier).toBe("duck");
    expect(hasPremiumBenefits(entitlement)).toBe(true);
    await expect(requireActiveEntitlement(userId)).resolves.toBeUndefined();

    const grants = await db.appPool.query<{
      promotion_identifier: string;
    }>("SELECT promotion_identifier FROM promotion_grants WHERE user_id = $1", [
      userId,
    ]);
    expect(grants.rows).toEqual([{ promotion_identifier: "duck" }]);
    expect(
      (await db.appPool.query("SELECT user_id FROM billing_customers")).rows,
    ).toHaveLength(0);
    expect(
      (await db.appPool.query("SELECT user_id FROM billing_subscriptions"))
        .rows,
    ).toHaveLength(0);
  });

  it("renders exact per-player flag answers only after premium promotion", async () => {
    const userId = await createUser(db, "personalized_guide");
    await seedContainedLabs(userId);
    const before = await PremiumSolutionGuide({
      userId,
      challengeKey: "crypto-failure",
    });
    expect(before).toBeNull();

    await redeemPromotion(userId, "duck");
    const flag = await db.appPool.query<{ secret_flag: string }>(
      `SELECT secret_flag FROM contained_challenge_state
       WHERE user_id = $1 AND challenge_key = 'crypto-failure'`,
      [userId],
    );
    const after = await PremiumSolutionGuide({
      userId,
      challengeKey: "crypto-failure",
    });
    expect(renderToStaticMarkup(after)).toContain(flag.rows[0]!.secret_flag);
  });

  it("does not let a Stripe trialing record mask a permanent promotion", async () => {
    const userId = await createUser(db, "promoted_and_trialing");
    await redeemPromotion(userId, "duck");
    await processStripeEvent({
      id: "evt_trialing_promo",
      created: 500,
      type: "customer.subscription.created",
      data: { object: subscription(userId, "trialing") },
    } as Stripe.Event);

    const entitlement = await getEntitlement(userId);
    expect(entitlement.source).toBe("promotion");
    expect(hasPremiumBenefits(entitlement)).toBe(true);
  });

  it("redeems duck idempotently with only one grant per account", async () => {
    const userId = await createUser(db, "repeat_promotion");

    expect((await redeemPromotion(userId, "duck")).newlyGranted).toBe(true);
    expect((await redeemPromotion(userId, " DUCK ")).newlyGranted).toBe(false);

    const grants = await db.appPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM promotion_grants WHERE user_id = $1",
      [userId],
    );
    expect(grants.rows[0]?.count).toBe("1");
  });

  it("rejects invalid and oversized promotion inputs without a grant", async () => {
    const userId = await createUser(db, "invalid_promotion");

    expect(normalizePromotionCode(" DUCK ")).toBe("duck");
    expect(normalizePromotionCode("goose")).toBeNull();
    expect(
      normalizePromotionCode("d".repeat(MAX_PROMOTION_CODE_LENGTH + 1)),
    ).toBeNull();
    await expect(redeemPromotion(userId, "goose")).rejects.toBeInstanceOf(
      InvalidPromotionCodeError,
    );
    await expect(
      redeemPromotion(userId, "d".repeat(MAX_PROMOTION_CODE_LENGTH + 1)),
    ).rejects.toBeInstanceOf(InvalidPromotionCodeError);

    expect(
      (await db.appPool.query("SELECT user_id FROM promotion_grants")).rows,
    ).toHaveLength(0);
  });

  it("reconciles subscription events idempotently and restores access", async () => {
    const userId = await createUser(db, "subscriber");
    await db.appPool.query(
      "UPDATE users SET trial_ends_at = now() - interval '1 day' WHERE id = $1",
      [userId],
    );
    const event = {
      id: "evt_test",
      type: "customer.subscription.updated",
      data: { object: subscription(userId) },
    } as Stripe.Event;
    expect(await processStripeEvent(event)).toBe(true);
    expect(await processStripeEvent(event)).toBe(false);
    expect((await getEntitlement(userId)).source).toBe("subscription");
    expect(hasPremiumBenefits(await getEntitlement(userId))).toBe(true);
    const events = await db.appPool.query(
      "SELECT stripe_event_id FROM stripe_webhook_events",
    );
    expect(events.rows).toHaveLength(1);
  });

  it("does not let an older active webhook restore canceled access", async () => {
    const userId = await createUser(db, "ordered_webhooks");
    await db.appPool.query(
      "UPDATE users SET trial_ends_at = now() - interval '1 day' WHERE id = $1",
      [userId],
    );
    const canceled = {
      id: "evt_cancel_new",
      created: 200,
      type: "customer.subscription.deleted",
      data: { object: subscription(userId, "canceled") },
    } as Stripe.Event;
    const staleActive = {
      id: "evt_active_old",
      created: 100,
      type: "customer.subscription.updated",
      data: { object: subscription(userId, "active") },
    } as Stripe.Event;

    await processStripeEvent(canceled);
    await processStripeEvent(staleActive);

    expect((await getEntitlement(userId)).active).toBe(false);
  });

  it("makes a terminal subscription state win equal-second webhook ties", async () => {
    const userId = await createUser(db, "same_second_webhooks");
    await db.appPool.query(
      "UPDATE users SET trial_ends_at = now() - interval '1 day' WHERE id = $1",
      [userId],
    );
    await processStripeEvent({
      id: "evt_cancel_tie",
      created: 300,
      type: "customer.subscription.deleted",
      data: { object: subscription(userId, "canceled") },
    } as Stripe.Event);
    await processStripeEvent({
      id: "evt_active_tie",
      created: 300,
      type: "customer.subscription.updated",
      data: { object: subscription(userId, "active") },
    } as Stripe.Event);

    expect((await getEntitlement(userId)).active).toBe(false);
  });

  it("reuses one pending checkout idempotency key", async () => {
    const userId = await createUser(db, "checkout_race");
    const first = await claimCheckoutAttempt(userId);
    const second = await claimCheckoutAttempt(userId);
    expect(second).toBe(first);

    await db.appPool.query(
      "UPDATE billing_checkout_attempts SET status = 'completed' WHERE user_id = $1",
      [userId],
    );
    expect(await claimCheckoutAttempt(userId)).not.toBe(first);
  });

  it("verifies the raw webhook body and rejects tampering", async () => {
    const payload = JSON.stringify({
      id: "evt_signed",
      object: "event",
      type: "billing.test",
      data: { object: {} },
    });
    const signature = getStripe().webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
    const accepted = await webhookPost(
      new Request("http://localhost:3000/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    expect(accepted.status).toBe(200);

    const rejected = await webhookPost(
      new Request("http://localhost:3000/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: `${payload} `,
      }),
    );
    expect(rejected.status).toBe(400);
  });

  it("rejects development billing simulation outside development", async () => {
    const response = await simulatePost(
      new Request("http://localhost:3000/api/billing/simulate/activate", {
        method: "POST",
      }),
      { params: Promise.resolve({ action: "activate" }) },
    );
    expect(response.status).toBe(404);
  });
});
