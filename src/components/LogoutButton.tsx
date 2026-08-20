"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/csrf";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={handleLogout}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
