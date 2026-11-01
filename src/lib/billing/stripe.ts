import Stripe from "stripe";
import { getEnv } from "@/lib/env";

let stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(getEnv().STRIPE_SECRET_KEY);
  }
  return stripe;
}

export function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
