"use client";

// Header toggle for presentation mode — hide/show all prices, per device (2026-09).
// Eye = prices visible; eye-off (+ active styling) = prices hidden, so a rep can tell at a glance
// they're presenting price-free and never leave it hidden by accident. Reachable on every page
// (it lives in AppChrome). State + persistence live in lib/price-visibility.ts. Default = shown.
import { usePriceHidden, togglePriceHidden } from "@/lib/price-visibility";

export default function PriceToggle() {
  const hidden = usePriceHidden();
  return (
    <button
      type="button"
      className={`price-toggle${hidden ? " active" : ""}`}
      onClick={() => togglePriceHidden()}
      aria-pressed={hidden}
      title={hidden ? "Prices hidden — tap to show" : "Hide prices"}
      aria-label={hidden ? "Show prices" : "Hide prices"}
    >
      {/* suppressHydrationWarning: the icon reflects a per-device value the server can't know, so
          it may differ between the server's "shown" render and the client's first paint. */}
      <span className="price-toggle-icon" aria-hidden="true" suppressHydrationWarning>
        {hidden ? (
          // eye-off
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          // eye
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </span>
      <span className="price-toggle-label" suppressHydrationWarning>{hidden ? "Prices off" : "Prices"}</span>
    </button>
  );
}
