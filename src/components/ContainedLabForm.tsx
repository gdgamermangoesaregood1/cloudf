"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/csrf";

export default function ContainedLabForm({
  challengeKey,
  label,
  placeholder,
}: {
  challengeKey: string;
  label: string;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await apiFetch(`/api/challenges/labs/${challengeKey}`, {
        method: "POST",
        body: JSON.stringify({ input }),
      });
      const data = (await response.json()) as {
        error?: string;
        output?: string;
        completed?: boolean;
      };
      setOutput(data.output ?? data.error ?? "Unexpected response.");
      setCompleted(Boolean(data.completed));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="lab-input">{label}</label>
        <textarea
          id="lab-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          maxLength={8000}
          required
        />
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Running simulator..." : "Send to target"}
      </button>
      {output !== null && (
        <pre className={completed ? "alert alert-success" : "card"}>{output}</pre>
      )}
      {completed && (
        <p className="alert alert-success">
          Challenge complete. The next level is now unlocked on your dashboard.
        </p>
      )}
    </form>
  );
}
