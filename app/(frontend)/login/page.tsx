"use client";

// Rep + admin sign-in. Posts to Payload's own login endpoint (/api/users/login),
// which sets the httpOnly `payload-token` session cookie; we also drop a small,
// non-sensitive localStorage marker ("summit-auth") that the offline shell uses to
// know this device has signed in (the cookie is httpOnly, so client JS can't read
// it). AppChrome hides the catalog header on this route, so the screen stands alone.
//
// Online-only by design: you can't obtain a new session without signal. Once signed
// in, the 90-day cookie + downloaded snapshot carry reps through offline use.
import { useEffect, useState } from "react";

/** Only allow same-origin internal redirects (no open-redirect via ?redirect=). */
function safeInternalPath(raw: string | null): string {
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [redirectTo, setRedirectTo] = useState("/");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectTo(safeInternalPath(params.get("redirect")));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        setError(
          res.status === 401
            ? "Incorrect email or password."
            : res.status === 429 || res.status === 423
              ? "Too many attempts. Please wait a few minutes and try again."
              : "Sign-in failed. Please try again.",
        );
        return;
      }
      try {
        localStorage.setItem("summit-auth", "1");
      } catch {
        /* private mode / storage disabled — cookie still carries the session */
      }
      // Full navigation so the new cookie is sent and the SSR guards re-run.
      window.location.assign(redirectTo);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "80vh", display: "grid", placeItems: "center", padding: "40px 0" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: "32px 28px",
          boxShadow: "0 10px 30px rgba(16,35,61,0.08)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/summit-logo.svg" alt="Summit Home Improvement" style={{ height: 64, width: "auto" }} />
        </div>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--brand)",
            fontSize: 24,
            textAlign: "center",
            margin: "0 0 4px",
          }}
        >
          Summit Catalog
        </h1>
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 14, margin: "0 0 24px" }}>
          Sign in to browse the catalog.
        </p>

        <form onSubmit={onSubmit}>
          <label style={labelStyle} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />

          <label style={{ ...labelStyle, marginTop: 16 }} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />

          {error && (
            <p role="alert" style={{ color: "#b42318", fontSize: 13, margin: "14px 0 0" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 22,
              height: 44,
              border: "none",
              borderRadius: 9,
              background: busy ? "var(--brand-dark)" : "var(--brand)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--ink)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  fontSize: 15,
  border: "1px solid var(--line)",
  borderRadius: 9,
  background: "#fff",
  color: "var(--ink)",
  boxSizing: "border-box",
};
