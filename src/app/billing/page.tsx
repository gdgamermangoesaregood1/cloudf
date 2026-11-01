import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getEntitlement } from "@/lib/billing/entitlements";
import BillingControls from "@/components/BillingControls";

export const metadata = { title: "Billing — SecTrain" };

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const entitlement = await getEntitlement(current.user.id);
  const { checkout } = await searchParams;

  return (
    <div className="container">
      <div className="card">
        <h1>Billing</h1>
        <p>$4 USD per month. Cancel any time through the customer portal.</p>
        {checkout === "success" && (
          <p className="alert alert-success">
            Checkout completed. Stripe is updating your subscription status.
          </p>
        )}
        <dl className="billing-status">
          <dt>Challenge access</dt>
          <dd>{entitlement.active ? "Active" : "Inactive"}</dd>
          <dt>Trial</dt>
          <dd>
            {entitlement.trialEndsAt.getTime() > Date.now()
              ? `Active until ${formatDate(entitlement.trialEndsAt)}`
              : `Ended ${formatDate(entitlement.trialEndsAt)}`}
          </dd>
          <dt>Subscription</dt>
          <dd>
            {entitlement.subscriptionStatus ?? "None"}
            {entitlement.currentPeriodEnd
              ? ` · ${entitlement.cancelAtPeriodEnd ? "ends" : "renews"} ${formatDate(entitlement.currentPeriodEnd)}`
              : ""}
          </dd>
          <dt>Promotion</dt>
          <dd>
            {entitlement.promotionIdentifier
              ? `${entitlement.promotionIdentifier} · permanent premium`
              : "None"}
          </dd>
        </dl>
        <BillingControls
          hasSubscription={entitlement.subscriptionStatus !== null}
          promotionIdentifier={entitlement.promotionIdentifier}
          development={process.env.NODE_ENV === "development"}
        />
      </div>
    </div>
  );
}
