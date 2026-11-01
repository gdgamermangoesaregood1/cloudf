import type Stripe from "stripe";
import { getAppPool, type DbClient } from "@/lib/db/pool";
import { stripeId } from "@/lib/billing/stripe";
import { getEnv } from "@/lib/env";

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  return ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null;
}

async function resolveUserId(
  customerId: string,
  metadataUserId: string | undefined,
  client: Pick<DbClient, "query">,
): Promise<string | null> {
  const known = await client.query<{ user_id: string }>(
    "SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1",
    [customerId],
  );
  if (known.rows[0]) return known.rows[0].user_id;
  if (!metadataUserId) return null;
  await client.query(
    `INSERT INTO billing_customers (user_id, stripe_customer_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = now()`,
    [metadataUserId, customerId],
  );
  return metadataUserId;
}

export async function reconcileSubscription(
  subscription: Stripe.Subscription,
  eventCreated = 0,
  client: Pick<DbClient, "query"> = getAppPool(),
): Promise<void> {
  const customerId = stripeId(subscription.customer);
  if (!customerId) throw new Error("Stripe subscription has no customer.");
  const userId = await resolveUserId(
    customerId,
    subscription.metadata.userId,
    client,
  );
  if (!userId) {
    throw new Error(`No local user for Stripe customer ${customerId}.`);
  }
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const configuredPriceId = getEnv().STRIPE_PRICE_ID;
  const entitlementStatus =
    configuredPriceId && priceId !== configuredPriceId
      ? "unrecognized_price"
      : subscription.status;
  await client.query(
    `INSERT INTO billing_subscriptions
       (stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id,
        status, current_period_end, cancel_at_period_end, last_event_created,
        updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       stripe_price_id = EXCLUDED.stripe_price_id,
       status = EXCLUDED.status,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       last_event_created = EXCLUDED.last_event_created,
       updated_at = now()
      WHERE billing_subscriptions.last_event_created < EXCLUDED.last_event_created
         OR (
           billing_subscriptions.last_event_created = EXCLUDED.last_event_created
           AND (
             EXCLUDED.status IN ('canceled', 'unpaid', 'incomplete_expired')
             OR billing_subscriptions.status NOT IN (
               'canceled', 'unpaid', 'incomplete_expired'
             )
           )
         )`,
    [
      subscription.id,
      userId,
      customerId,
      priceId,
      entitlementStatus,
      periodEnd(subscription),
      subscription.cancel_at_period_end,
      eventCreated,
    ],
  );
}

export async function reconcileCheckoutSession(
  session: Stripe.Checkout.Session,
  client: Pick<DbClient, "query"> = getAppPool(),
): Promise<void> {
  const userId = session.client_reference_id ?? session.metadata?.userId;
  const customerId = stripeId(session.customer);
  if (!userId || !customerId) {
    throw new Error("Checkout session is missing its user or customer.");
  }
  await client.query(
    `INSERT INTO billing_customers (user_id, stripe_customer_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = now()`,
    [userId, customerId],
  );
  await client.query(
    `UPDATE billing_checkout_attempts
     SET status = 'completed', updated_at = now()
     WHERE user_id = $1`,
    [userId],
  );
}

export async function processStripeEvent(
  event: Stripe.Event,
): Promise<boolean> {
  const pool = getAppPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query(
      `INSERT INTO stripe_webhook_events (stripe_event_id, event_type)
       VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING stripe_event_id`,
      [event.id, event.type],
    );
    if ((claimed.rowCount ?? 0) === 0) {
      await client.query("COMMIT");
      return false;
    }
    if (event.type === "checkout.session.completed") {
      await reconcileCheckoutSession(
        event.data.object as Stripe.Checkout.Session,
        client,
      );
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await reconcileSubscription(
        event.data.object as Stripe.Subscription,
        event.created ?? 0,
        client,
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
