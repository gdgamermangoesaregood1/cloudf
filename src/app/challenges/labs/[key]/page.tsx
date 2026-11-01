import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/session";
import {
  ChallengeAccessError,
  requireChallengeAccess,
} from "@/lib/challenges/progress";
import { getChallengeMeta, type ChallengeKey } from "@/lib/challenges/registry";
import {
  getContainedLabView,
  isContainedChallengeKey,
} from "@/lib/challenges/contained-labs";
import {
  getAdvancedLabView,
  isAdvancedChallengeKey,
} from "@/lib/challenges/advanced-labs";
import ContainedLabForm from "@/components/ContainedLabForm";
import { EntitlementRequiredError } from "@/lib/billing/entitlements";
import PremiumSolutionGuide from "@/components/PremiumSolutionGuide";

export default async function ContainedChallengePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  const { key: rawKey } = await params;
  if (!isContainedChallengeKey(rawKey) && !isAdvancedChallengeKey(rawKey)) {
    notFound();
  }
  const key: ChallengeKey = rawKey;

  try {
    await requireChallengeAccess(current.user.id, key);
  } catch (error) {
    if (
      error instanceof ChallengeAccessError ||
      error instanceof EntitlementRequiredError
    )
      redirect("/dashboard");
    throw error;
  }

  const meta = getChallengeMeta(key);
  const view = isAdvancedChallengeKey(rawKey)
    ? await getAdvancedLabView(current.user.id, rawKey)
    : await getContainedLabView(current.user.id, rawKey);

  return (
    <div className="container">
      <div className="card">
        <p className="hint-text">
          Level {meta.order} · {meta.difficulty}
        </p>
        <h1>{meta.title}</h1>
        <p>{meta.summary}</p>
      </div>
      <div className="card">
        <h2>Contained target</h2>
        <p>{view.instructions}</p>
        <pre>{view.evidence}</pre>
      </div>
      <div className="card">
        {rawKey === "csrf" ? (
          <>
            <h2>Legacy action</h2>
            <p>
              This intentionally unsafe GET changes only your fictional lab
              setting. It cannot modify account or application security data.
            </p>
            <Link
              className="btn"
              href="/api/challenges/labs/csrf?action=disable-alerts"
              prefetch={false}
            >
              Test crafted request
            </Link>
          </>
        ) : (
          <ContainedLabForm
            challengeKey={rawKey}
            label={view.inputLabel}
            placeholder={view.placeholder}
          />
        )}
      </div>
      <details className="card hints">
        <summary>Hints</summary>
        <ol>
          {meta.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ol>
      </details>
      <PremiumSolutionGuide userId={current.user.id} challengeKey={rawKey} />
    </div>
  );
}
