import Link from "next/link";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Log in — SecTrain" };

export default function LoginPage() {
  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1>Log in</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="hint-text" style={{ marginTop: "1rem" }}>
          No account yet? <Link href="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
