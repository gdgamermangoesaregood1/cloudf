import { NextResponse } from "next/server";
import { requireSessionWithCsrf } from "@/lib/security/api-guard";
import { getAppPool } from "@/lib/db/pool";
import { getEnv } from "@/lib/env";
import { getStripe } from "@/lib/billing/stripe";

export async function POST(request: Request) {
  const guard = await requireSessionWithCsrf(request);
  if (!guard.ok) return guard.response;
  const result = await getAppPool().query<{ stripe_customer_id: string }>(
    "SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1",
    [guard.user.id],
  );
  const customerId = result.rows[0]?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer exists for this account." },
      { status: 404 },
    );
  }
  const portal = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getEnv().APP_URL}/billing`,
  });
  return NextResponse.json({ url: portal.url });
}
