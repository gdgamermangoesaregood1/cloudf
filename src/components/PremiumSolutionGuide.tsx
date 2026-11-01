import React from "react";
import {
  getEntitlement,
  hasPremiumBenefits,
  type Entitlement,
} from "@/lib/billing/entitlements";
import {
  getChallengeMeta,
  type ChallengeKey,
  type SolutionGuide,
} from "@/lib/challenges/registry";
import { getAppPool } from "@/lib/db/pool";

export function hasPremiumGuideAccess(entitlement: {
  active: boolean;
  source: Entitlement["source"];
  subscriptionStatus: string | null;
}): boolean {
  return entitlement.active && hasPremiumBenefits(entitlement);
}

export function solutionForEntitlement(
  key: ChallengeKey,
  entitlement: Pick<
    Entitlement,
    "active" | "source" | "subscriptionStatus"
  >,
): SolutionGuide | null {
  return hasPremiumGuideAccess(entitlement)
    ? getChallengeMeta(key).solution
    : null;
}

async function personalizeSolution(
  userId: string,
  challengeKey: ChallengeKey,
  solution: SolutionGuide,
): Promise<SolutionGuide> {
  if (
    challengeKey !== "crypto-failure" &&
    challengeKey !== "exception-handling"
  ) {
    return solution;
  }
  const result = await getAppPool().query<{ secret_flag: string }>(
    `SELECT secret_flag FROM contained_challenge_state
     WHERE user_id = $1 AND challenge_key = $2`,
    [userId, challengeKey],
  );
  const flag = result.rows[0]?.secret_flag;
  if (!flag) {
    throw new Error(`Missing ${challengeKey} solution state for player.`);
  }
  return {
    ...solution,
    answer:
      challengeKey === "crypto-failure"
        ? `Submit ${flag}.`
        : `Submit a non-integer such as abc to trigger the leak, then submit ${flag}.`,
  };
}

export default async function PremiumSolutionGuide({
  userId,
  challengeKey,
}: {
  userId: string;
  challengeKey: ChallengeKey;
}) {
  const entitlement = await getEntitlement(userId);
  const baseSolution = solutionForEntitlement(challengeKey, entitlement);
  if (!baseSolution) return null;
  const solution = await personalizeSolution(
    userId,
    challengeKey,
    baseSolution,
  );

  return (
    <details className="card solution-guide">
      <summary>Premium solution guide</summary>
      <div>
        <h3>Answer / steps</h3>
        <pre>{solution.answer}</pre>
        <h3>Why it works</h3>
        <p>{solution.explanation}</p>
        <h3>How real systems patch it</h3>
        <p>{solution.remediation}</p>
      </div>
    </details>
  );
}
