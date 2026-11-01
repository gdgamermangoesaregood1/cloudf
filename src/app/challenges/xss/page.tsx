import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import {
  requireChallengeAccess,
  ChallengeAccessError,
} from "@/lib/challenges/progress";
import { getMessage, issueRenderToken } from "@/lib/challenges/xss";
import { getChallengeMeta } from "@/lib/challenges/registry";
import XssMessageForm from "@/components/XssMessageForm";
import { EntitlementRequiredError } from "@/lib/billing/entitlements";
import PremiumSolutionGuide from "@/components/PremiumSolutionGuide";

export const metadata = { title: "Stored XSS Challenge — SecTrain" };

export default async function XssChallengePage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  try {
    await requireChallengeAccess(current.user.id, "xss");
  } catch (err) {
    if (
      err instanceof ChallengeAccessError ||
      err instanceof EntitlementRequiredError
    )
      redirect("/dashboard");
    throw err;
  }

  const meta = getChallengeMeta("xss");
  const content = await getMessage(current.user.id);
  const { token } = await issueRenderToken(current.user.id);

  return (
    <div className="container">
      <div className="card">
        <h1>{meta.title}</h1>
        <p>{meta.summary}</p>
      </div>

      <div className="card">
        <h2>Post a guestbook message</h2>
        <p className="hint-text">
          Saved content is rendered unescaped in the sandboxed preview below.
          The preview frame has no cookies and no access to this page — it runs
          in an opaque, sandboxed origin. To prove your script ran, make it call{" "}
          <code>window.__CHALLENGE_FLAG__</code> and{" "}
          <code>window.__RENDER_TOKEN__</code>, then send both to{" "}
          <code>/api/challenges/xss/callback</code>.
        </p>
        <XssMessageForm initialContent={content} />
      </div>

      <div className="card">
        <h2>Sandboxed preview</h2>
        <p className="hint-text">
          <code>iframe sandbox=&quot;allow-scripts&quot;</code> (no{" "}
          <code>allow-same-origin</code>), with a locked-down
          Content-Security-Policy on the framed document.
        </p>
        <div className="sandbox-frame-wrap">
          <iframe
            key={token}
            src={`/api/challenges/xss/frame?rt=${encodeURIComponent(token)}`}
            sandbox="allow-scripts"
            title="Sandboxed guestbook preview"
            referrerPolicy="no-referrer"
          />
        </div>
        <p className="hint-text">
          Reload this page any time to get a fresh preview token (each one is
          single-use and expires after a few minutes). Once your callback
          succeeds, check your dashboard — this challenge will show as
          completed.
        </p>
      </div>
      <PremiumSolutionGuide userId={current.user.id} challengeKey="xss" />
    </div>
  );
}
