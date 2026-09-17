"use client";

// Root client-error boundary. Replaces Next's generic white "Application error:
// a client-side exception has occurred" with the ACTUAL message on screen — so a
// crash on a device we can't attach a debugger to (e.g. an iPad in the field) is
// diagnosable by reading it aloud. Branded + a reload button.
//
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#fff", color: "#1a1a1a" }}>
        <div style={{ maxWidth: 560, margin: "8vh auto", textAlign: "center", padding: "0 20px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/summit-logo.svg" alt="Summit Home Improvement" style={{ width: 96, marginBottom: 20 }} />
          <h1 style={{ color: "#14532d", fontSize: 24, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#444", fontSize: 15, lineHeight: 1.5, margin: "0 0 16px" }}>
            The catalog hit an unexpected error. If you&rsquo;re offline, reconnect and try again.
          </p>
          <pre
            style={{
              textAlign: "left",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#f4f6fb",
              border: "1px solid #dbe4f5",
              borderRadius: 8,
              padding: "12px 14px",
              fontSize: 13,
              color: "#8a1f1f",
              margin: "0 0 18px",
            }}
          >
            {error?.message || "Unknown error"}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#14532d",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 22px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
