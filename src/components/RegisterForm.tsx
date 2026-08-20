"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function RegisterForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        setFieldErrors(data.fieldErrors ?? {});
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" noValidate>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-describedby="username-help"
          aria-invalid={Boolean(fieldErrors.username)}
        />
        <span id="username-help" className="hint-text">
          3–32 characters: letters, numbers, hyphens, underscores.
        </span>
        {fieldErrors.username?.map((msg) => (
          <span
            key={msg}
            className="hint-text"
            style={{ color: "var(--danger)" }}
          >
            {msg}
          </span>
        ))}
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-help"
          aria-invalid={Boolean(fieldErrors.password)}
        />
        <span id="password-help" className="hint-text">
          At least 10 characters. Longer, memorable passphrases are best.
        </span>
        {fieldErrors.password?.map((msg) => (
          <span
            key={msg}
            className="hint-text"
            style={{ color: "var(--danger)" }}
          >
            {msg}
          </span>
        ))}
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={Boolean(fieldErrors.confirmPassword)}
        />
        {fieldErrors.confirmPassword?.map((msg) => (
          <span
            key={msg}
            className="hint-text"
            style={{ color: "var(--danger)" }}
          >
            {msg}
          </span>
        ))}
      </div>
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
