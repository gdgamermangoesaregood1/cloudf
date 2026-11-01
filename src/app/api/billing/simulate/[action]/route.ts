import { NextResponse } from "next/server";
import { requireSessionWithCsrf } from "@/lib/security/api-guard";
import { getAppPool } from "@/lib/db/pool";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const guard = await requireSessionWithCsrf(request);
  if (!guard.ok) return guard.response;
  const { action } = await params;
  if (action === "activate") {
    await getAppPool().query(
      `INSERT INTO billing_customers (user_id, stripe_customer_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = now()`,
      [guard.user.id, `dev_cus_${guard.user.id}`],
    );
    await getAppPool().query(
      `INSERT INTO billing_subscriptions
         (stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id,
          status, current_period_end)
       VALUES ($1, $2, $3, 'price_dev_4_month', 'active', now() + interval '30 days')
       ON CONFLICT (stripe_subscription_id) DO UPDATE SET
         status = 'active', current_period_end = now() + interval '30 days',
         cancel_at_period_end = false, updated_at = now()`,
      [`dev_sub_${guard.user.id}`, guard.user.id, `dev_cus_${guard.user.id}`],
    );
  } else if (action === "expire") {
    await getAppPool().query(
      "UPDATE users SET trial_ends_at = now() - interval '1 second' WHERE id = $1",
      [guard.user.id],
    );
    await getAppPool().query(
      `UPDATE billing_subscriptions
       SET status = 'canceled', current_period_end = now() - interval '1 second',
           updated_at = now()
       WHERE user_id = $1`,
      [guard.user.id],
    );
  } else {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
