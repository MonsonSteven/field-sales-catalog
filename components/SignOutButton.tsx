"use client";

import { useState } from "react";

/**
 * Sign out: clears the Payload session cookie (POST /api/users/logout) and the local
 * "logged-in" marker, then returns to /login. Best-effort offline — if the logout
 * request can't reach the server (no signal) we still clear the local marker and go
 * to /login; the long-lived cookie simply expires on its own server-side.
 */
export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch("/api/users/logout", { method: "POST", credentials: "include" });
    } catch {
      /* offline — cookie will expire server-side; still clear local state below */
    }
    try {
      localStorage.removeItem("summit-auth");
    } catch {
      /* ignore */
    }
    window.location.assign("/login");
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      title="Sign out of the catalog"
      style={{
        whiteSpace: "nowrap",
        fontSize: 13,
        fontWeight: 600,
        padding: "7px 12px",
        borderRadius: 6,
        border: "1px solid var(--line)",
        background: "#fff",
        color: "var(--muted)",
        cursor: busy ? "wait" : "pointer",
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
