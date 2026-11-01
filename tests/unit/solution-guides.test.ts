import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getEntitlement = vi.hoisted(() => vi.fn());

vi.mock("@/lib/billing/entitlements", () => ({
  getEntitlement,
  hasPremiumBenefits: ({
    source,
    subscriptionStatus,
  }: {
    source: string;
    subscriptionStatus: string | null;
  }) =>
    source === "promotion" ||
    (source === "subscription" && subscriptionStatus === "active"),
}));
vi.mock("@/lib/db/pool", () => ({
  getAppPool: () => ({ query: vi.fn() }),
}));

import PremiumSolutionGuide, {
  hasPremiumGuideAccess,
  solutionForEntitlement,
} from "@/components/PremiumSolutionGuide";

describe("premium solution guides", () => {
  beforeEach(() => {
    getEntitlement.mockReset();
  });

  it("does not return or render guide content for trial-only users", async () => {
    const trial = {
      active: true,
      source: "trial",
      subscriptionStatus: null,
    } as const;
    getEntitlement.mockResolvedValue(trial);

    expect(solutionForEntitlement("api-idor", trial)).toBeNull();
    const rendered = await PremiumSolutionGuide({
      userId: "trial-user",
      challengeKey: "api-idor",
    });
    expect(rendered).toBeNull();
    expect(renderToStaticMarkup(rendered)).toBe("");
  });

  it("renders a collapsed guide for active subscriptions", async () => {
    getEntitlement.mockResolvedValue({
      active: true,
      source: "subscription",
      subscriptionStatus: "active",
    });

    const rendered = await PremiumSolutionGuide({
      userId: "paid-user",
      challengeKey: "api-idor",
    });
    const html = renderToStaticMarkup(rendered);

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Premium solution guide");
    expect(html).toContain("Submit invoice ID 4102.");
    expect(html).toContain("How real systems patch it");
  });

  it("treats active promotional entitlements as premium", () => {
    expect(
      hasPremiumGuideAccess({
        active: true,
        source: "promotion",
        subscriptionStatus: null,
      }),
    ).toBe(true);
    expect(
      hasPremiumGuideAccess({
        active: false,
        source: "promotion",
        subscriptionStatus: null,
      }),
    ).toBe(false);
    expect(
      hasPremiumGuideAccess({
        active: false,
        source: "none",
        subscriptionStatus: null,
      }),
    ).toBe(false);
  });

  it("does not treat Stripe trialing status as a paid guide entitlement", () => {
    expect(
      hasPremiumGuideAccess({
        active: true,
        source: "subscription",
        subscriptionStatus: "trialing",
      }),
    ).toBe(false);
  });
});
