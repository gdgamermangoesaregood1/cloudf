import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import {
  requireChallengeAccess,
  ChallengeAccessError,
} from "@/lib/challenges/progress";
import { searchItems } from "@/lib/challenges/sqli";
import { getChallengeMeta } from "@/lib/challenges/registry";

export const metadata = { title: "SQL Injection Challenge — SecTrain" };

export default async function SqliChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  try {
    await requireChallengeAccess(current.user.id, "sqli");
  } catch (err) {
    if (err instanceof ChallengeAccessError) redirect("/dashboard");
    throw err;
  }

  const meta = getChallengeMeta("sqli");
  const { q } = await searchParams;
  const outcome =
    q !== undefined ? await searchItems(current.user.id, q) : null;
  const columns =
    outcome && outcome.rows.length > 0 ? Object.keys(outcome.rows[0]!) : [];

  return (
    <div className="container">
      <div className="card">
        <h1>{meta.title}</h1>
        <p>{meta.summary}</p>
      </div>

      <div className="card">
        <h2>Directory search</h2>
        <form
          method="get"
          className="stack"
          style={{ flexDirection: "row", alignItems: "end", gap: "0.75rem" }}
        >
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="q">Search term</label>
            <input id="q" name="q" type="text" defaultValue={q ?? ""} />
          </div>
          <button type="submit">Search</button>
        </form>

        {outcome?.justCompleted && (
          <p className="alert alert-success" role="status">
            Challenge complete! The stored-XSS challenge is now unlocked on your
            dashboard.
          </p>
        )}

        {outcome?.error && (
          <div style={{ marginTop: "1rem" }}>
            <p className="alert alert-error" role="alert">
              The database rejected this query:
            </p>
            <pre>{outcome.error}</pre>
          </div>
        )}

        {outcome && !outcome.error && (
          <div style={{ marginTop: "1rem" }}>
            {outcome.rows.length === 0 ? (
              <p className="hint-text">No results.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outcome.rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c}>{String(row[c] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
