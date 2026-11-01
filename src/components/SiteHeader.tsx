import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default function SiteHeader({ username }: { username: string | null }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={username ? "/dashboard" : "/"} className="brand">
          SecTrain
        </Link>
        <nav aria-label="Account">
          {username ? (
            <div
              className="stack"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <span className="hint-text">
                Signed in as <strong>{username}</strong>
              </span>
              <Link href="/billing" className="btn-secondary btn">
                Billing
              </Link>
              <LogoutButton />
            </div>
          ) : (
            <div
              className="stack"
              style={{ flexDirection: "row", gap: "0.5rem" }}
            >
              <Link href="/login" className="btn-secondary btn">
                Log in
              </Link>
              <Link href="/register" className="btn">
                Register
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
