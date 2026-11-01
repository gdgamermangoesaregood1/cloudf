import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/session";
import { getProgress } from "@/lib/challenges/progress";
import { getChallengeMeta } from "@/lib/challenges/registry";
import ResetProgressButton from "@/components/ResetProgressButton";
import { getEntitlement } from "@/lib/billing/entitlements";

export const metadata = { title: "Dashboard — SecTrain" };

function statusBadge(
  entitled: boolean,
  unlocked: boolean,
  completedAt: string | null,
) {
  if (!entitled)
    return <span className="badge badge-locked">Subscription required</span>;
  if (completedAt)
    return <span className="badge badge-completed">Completed</span>;
  if (unlocked) return <span className="badge badge-unlocked">Unlocked</span>;
  return <span className="badge badge-locked">Locked</span>;
}

export default async function DashboardPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  const progress = await getProgress(current.user.id);
  const entitlement = await getEntitlement(current.user.id);
  const completedCount = progress.filter((p) => p.completedAt).length;

  return (
    <div className="container">
      <div className="card">
        <h1>Welcome, {current.user.username}</h1>
        <p className="hint-text">
          {completedCount} of {progress.length} challenges completed. Work
          through them in order — each one unlocks the next.
        </p>
      </div>

      {!entitlement.active && (
        <div className="card">
          <p className="alert alert-error">
            Your 15-day trial has ended. Challenge controls and hints are hidden
            until you subscribe.
          </p>
          <Link href="/billing" className="btn">
            Subscribe for $4/month
          </Link>
        </div>
      )}

      <ul className="challenge-list">
        {progress.map((p) => {
          const meta = getChallengeMeta(p.key);
          return (
            <li key={p.key} className="challenge-card">
              <div className="challenge-card-head">
                <h2 style={{ margin: 0 }}>{meta.title}</h2>
                {statusBadge(entitlement.active, p.unlocked, p.completedAt)}
              </div>
              <p className="hint-text">
                Level {meta.order} · {meta.difficulty}
              </p>
              <p>{meta.summary}</p>
              {entitlement.active && p.unlocked ? (
                <Link href={meta.path} className="btn">
                  {p.completedAt ? "Revisit challenge" : "Open challenge"}
                </Link>
              ) : entitlement.active ? (
                <p className="hint-text">
                  Locked — complete the previous challenge to unlock this one.
                </p>
              ) : null}
              {entitlement.active && p.unlocked && (
                <details className="hints">
                  <summary>Hints</summary>
                  <ol>
                    {meta.hints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ol>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {entitlement.active && (
        <div className="card">
          <h2>Reset progress</h2>
          <p className="hint-text">
            Regenerate a fresh world and flags, and re-lock every challenge
            except the first. Only affects your own account.
          </p>
          <ResetProgressButton />
        </div>
      )}
    </div>
  );
}
