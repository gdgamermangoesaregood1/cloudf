"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/csrf";

export default function ResetProgressButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch("/api/challenges/reset", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Reset failed.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn-danger"
        onClick={() => setConfirming(true)}
      >
        Reset all my progress
      </button>
    );
  }

  return (
    <div className="stack">
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <p>
        This regenerates a brand-new world/flags and re-locks every challenge
        except the first. This cannot be undone. Are you sure?
      </p>
      <div className="stack" style={{ flexDirection: "row", gap: "0.75rem" }}>
        <button
          type="button"
          className="btn-danger"
          onClick={handleReset}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Resetting…" : "Yes, reset everything"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
