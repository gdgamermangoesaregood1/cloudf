import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import {
  requireChallengeAccess,
  ChallengeAccessError,
} from "@/lib/challenges/progress";
import { listPublicRecords, fetchRecordForPlayer } from "@/lib/challenges/idor";
import { getChallengeMeta } from "@/lib/challenges/registry";

export const metadata = { title: "IDOR Challenge — SecTrain" };

export default async function IdorChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ recordIndex?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  try {
    await requireChallengeAccess(current.user.id, "idor");
  } catch (err) {
    if (err instanceof ChallengeAccessError) redirect("/dashboard");
    throw err;
  }

  const meta = getChallengeMeta("idor");
  const records = await listPublicRecords(current.user.id);
  const { recordIndex } = await searchParams;

  let viewed: Awaited<ReturnType<typeof fetchRecordForPlayer>> | null = null;
  const parsedIndex = recordIndex ? Number.parseInt(recordIndex, 10) : null;
  if (parsedIndex !== null && Number.isFinite(parsedIndex)) {
    viewed = await fetchRecordForPlayer(current.user.id, parsedIndex);
  }

  return (
    <div className="container">
      <div className="card">
        <h1>{meta.title}</h1>
        <p>{meta.summary}</p>
      </div>

      <div className="card">
        <h2>Your company directory</h2>
        <p className="hint-text">
          These records are visible to every employee in your world. The record
          viewer below takes a record number — try more than what is linked
          here.
        </p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.recordIndex}>
                <td>{r.recordIndex}</td>
                <td>{r.title}</td>
                <td>
                  <a href={`/challenges/idor?recordIndex=${r.recordIndex}`}>
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Record viewer</h2>
        <form
          method="get"
          className="stack"
          style={{ flexDirection: "row", alignItems: "end", gap: "0.75rem" }}
        >
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="recordIndex">Record number</label>
            <input
              id="recordIndex"
              name="recordIndex"
              type="text"
              inputMode="numeric"
              defaultValue={recordIndex ?? ""}
            />
          </div>
          <button type="submit">View record</button>
        </form>

        {viewed && (
          <div style={{ marginTop: "1.25rem" }}>
            {!viewed.found && (
              <p className="alert alert-error" role="alert">
                No record #{parsedIndex} exists in your world.
              </p>
            )}
            {viewed.found && viewed.record && (
              <div className="stack">
                {viewed.record.requiresClearance && (
                  <p className="alert alert-error" role="alert">
                    This record required manager clearance — the app did not
                    check for it. That is the vulnerability.
                  </p>
                )}
                {viewed.justCompleted && (
                  <p className="alert alert-success" role="status">
                    Challenge complete! The SQL injection challenge is now
                    unlocked on your dashboard.
                  </p>
                )}
                <h3>{viewed.record.title}</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>{viewed.record.body}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
