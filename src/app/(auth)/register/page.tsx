import Link from "next/link";
import RegisterForm from "@/components/RegisterForm";

export const metadata = { title: "Register — SecTrain" };

export default function RegisterPage() {
  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1>Create your account</h1>
        <p className="hint-text">
          Registering generates your own private, isolated set of challenge
          data. Nothing here is shared with other players.
        </p>
        <RegisterForm />
        <p className="hint-text" style={{ marginTop: "1rem" }}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
