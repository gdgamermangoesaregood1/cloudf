import { NextResponse } from "next/server";
import { requireSessionWithCsrf } from "@/lib/security/api-guard";
import { getEnv } from "@/lib/env";
import { getStripe } from "@/lib/billing/stripe";
import { getAppPool } from "@/lib/db/pool";
import { claimCheckoutAttempt } from "@/lib/billing/checkout";

export async function POST(request: Request) {
  const guard = await requireSessionWithCsrf(request);
  if (!guard.ok) return guard.response;
  const env = getEnv();
  const existing = await getAppPool().query<{ stripe_customer_id: string }>(
    "SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1",
    [guard.user.id],
  );
  const active = await getAppPool().query<{ stripe_subscription_id: string }>(
    `SELECT stripe_subscription_id FROM billing_subscriptions
     WHERE user_id = $1 AND status IN ('active', 'trialing')
     LIMIT 1`,
    [guard.user.id],
  );
  if (active.rows[0]) {
    return NextResponse.json(
      { error: "This account already has an active subscription." },
      { status: 409 },
    );
  }
  const idempotencyKey = await claimCheckoutAttempt(guard.user.id);
  const checkout = await getStripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer: existing.rows[0]?.stripe_customer_id,
      line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: guard.user.id,
      metadata: { userId: guard.user.id },
      subscription_data: { metadata: { userId: guard.user.id } },
      success_url: `${env.APP_URL}/billing?checkout=success`,
      cancel_url: `${env.APP_URL}/billing?checkout=cancelled`,
      allow_promotion_codes: true,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    },
    { idempotencyKey },
  );
  if (!checkout.url) {
    return NextResponse.json(
      { error: "Stripe did not provide a checkout URL." },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: checkout.url });
}
