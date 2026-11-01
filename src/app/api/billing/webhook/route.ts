import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getStripe } from "@/lib/billing/stripe";
import { processStripeEvent } from "@/lib/billing/reconcile";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 },
    );
  }
  const rawBody = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      getEnv().STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid Stripe signature." },
      { status: 400 },
    );
  }
  try {
    const processed = await processStripeEvent(event);
    return NextResponse.json({ received: true, processed });
  } catch (error) {
    console.error("Stripe webhook reconciliation failed:", error);
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
