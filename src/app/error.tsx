"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container">
      <div className="card">
        <h1>Something went wrong</h1>
        <p>
          An unexpected error occurred. This can happen if the database is
          not reachable — if you are running this locally, make sure{" "}
          <code>docker compose up</code> is running and migrations have
          completed.
        </p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
