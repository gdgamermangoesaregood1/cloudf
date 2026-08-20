"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/csrf";

export default function XssMessageForm({
  initialContent,
}: {
  initialContent: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch("/api/challenges/xss/message", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save message.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="content">
          Guestbook message (HTML/JS is rendered as-is in the preview)
        </label>
        <textarea
          id="content"
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={4000}
        />
      </div>
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save message"}
      </button>
    </form>
  );
}
