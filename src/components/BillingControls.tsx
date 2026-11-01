"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/csrf";

export default function BillingControls({
  hasSubscription,
  promotionIdentifier,
  development,
}: {
  hasSubscription: boolean;
  promotionIdentifier: string | null;
  development: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promotionCode, setPromotionCode] = useState("");
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);

  async function begin(path: string, action: string) {
    setPending(action);
    setError(null);
    try {
      const response = await apiFetch(path, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Billing request failed.");
      } else if (data.url) {
        window.location.assign(data.url);
      } else {
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  async function redeemPromotion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("promotion");
    setError(null);
    setPromotionMessage(null);
    try {
      const response = await apiFetch("/api/billing/promotion", {
        method: "POST",
        body: JSON.stringify({ code: promotionCode }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        alreadyRedeemed?: boolean;
      };
      if (!response.ok) {
        setError(data.error ?? "Unable to redeem promotion code.");
        return;
      }
      setPromotionMessage(
        data.alreadyRedeemed
          ? "This account already has permanent promotional premium."
          : "Promotion redeemed. Permanent premium is now active.",
      );
      setPromotionCode("");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="stack">
      {error && <p className="alert alert-error">{error}</p>}
      <div className="billing-actions">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => begin("/api/billing/checkout", "checkout")}
        >
          {pending === "checkout" ? "Opening…" : "Subscribe for $4/month"}
        </button>
        {hasSubscription && (
          <button
            type="button"
            className="btn-secondary"
            disabled={pending !== null}
            onClick={() => begin("/api/billing/portal", "portal")}
          >
            {pending === "portal" ? "Opening…" : "Manage subscription"}
          </button>
        )}
      </div>
      <div className="card">
        <h2>Promotion code</h2>
        {promotionIdentifier ? (
          <p className="alert alert-success">
            Permanent promotional premium is active ({promotionIdentifier}).
          </p>
        ) : (
          <form className="stack" onSubmit={redeemPromotion}>
            <div className="field">
              <label htmlFor="promotion-code">Code</label>
              <input
                id="promotion-code"
                type="text"
                value={promotionCode}
                maxLength={64}
                autoComplete="off"
                disabled={pending !== null}
                onChange={(event) => setPromotionCode(event.target.value)}
              />
            </div>
            <div>
              <button type="submit" disabled={pending !== null}>
                {pending === "promotion" ? "Redeeming…" : "Redeem code"}
              </button>
            </div>
          </form>
        )}
        {promotionMessage && (
          <p className="alert alert-success">{promotionMessage}</p>
        )}
      </div>
      {development && (
        <div className="card">
          <h2>Development billing simulation</h2>
          <div className="billing-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={pending !== null}
              onClick={() =>
                begin("/api/billing/simulate/activate", "activate")
              }
            >
              Simulate active
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={pending !== null}
              onClick={() => begin("/api/billing/simulate/expire", "expire")}
            >
              Expire trial/subscription
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
