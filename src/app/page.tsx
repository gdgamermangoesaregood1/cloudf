import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/session";

export default async function Home() {
  const current = await getCurrentSession();
  if (current) redirect("/dashboard");

  return (
    <div className="container">
      <div className="card">
        <h1>SecTrain: a local security training lab</h1>
        <p>
          Register a free local account to get your own generated data and work
          through three sequential, hands-on vulnerability challenges:
        </p>
        <ol>
          <li>
            <strong>Broken object-level authorization (IDOR)</strong> in a
            fictional set of company records — scoped entirely to your own
            generated world.
          </li>
          <li>
            <strong>SQL injection</strong> in an isolated, least-privileged
            search feature that cannot reach credentials or other players.
          </li>
          <li>
            <strong>Stored cross-site scripting</strong>, rendered only inside a
            sandboxed, no-same-origin iframe with a locked-down
            Content-Security-Policy.
          </li>
        </ol>
        <div className="stack" style={{ flexDirection: "row", gap: "0.75rem" }}>
          <Link href="/register" className="btn">
            Create an account
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
