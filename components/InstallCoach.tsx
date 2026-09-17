"use client";

import React, { useEffect, useState } from "react";

const DISMISS_KEY = "summit-install-coach-dismissed";

/** iPadOS 13+ Safari reports as "Macintosh" — distinguish a real Mac from an
 *  iPad by touch capability. Also covers legacy iPhone/iPad/iPod UA strings. */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOSClassic = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  return iOSClassic || iPadOS;
}

/** Already launched from the Home Screen (installed) — no need to coach. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS-specific flag + the standard display-mode media query.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const mq = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return iosStandalone || mq;
}

/**
 * Dismissible "Add to Home Screen" coach for rep iPads. Shows only on iOS/iPadOS
 * Safari, only when the app isn't already installed, and only until dismissed.
 * Installing is what unlocks reliable offline storage + full-screen launch — the
 * foundation the per-vendor offline download (later phase) depends on.
 */
export const InstallCoach: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIOS() || isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private mode / storage blocked — still fine to show */
    }
    setShow(true);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Summit Catalog"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 1000,
        margin: "0 auto",
        maxWidth: 560,
        background: "#14532d",
        color: "#fff",
        borderRadius: 12,
        boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/summit-logo.svg"
        alt=""
        width={40}
        height={40}
        style={{ borderRadius: 8, flexShrink: 0 }}
      />
      <div style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>
        <strong style={{ display: "block", marginBottom: 2 }}>Install Summit Catalog for offline use</strong>
        <span style={{ color: "#DCE7FB" }}>
          Tap the Share icon{" "}
          <span aria-hidden="true" style={{ display: "inline-block", transform: "translateY(2px)" }}>
            {/* iOS share glyph */}
            <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">
              <path d="M7 1L4 4M7 1l3 3M7 1v9" stroke="#DCE7FB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 7H1v7.5h12V7h-1" stroke="#DCE7FB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          , then choose <strong style={{ color: "#fff" }}>Add to Home Screen</strong>.
        </span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "rgba(255,255,255,0.15)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Got it
      </button>
    </div>
  );
};
