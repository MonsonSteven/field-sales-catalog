"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadForOffline, offlineStatus, type OfflineProgress, type OfflineStatus } from "@/lib/offline";
import { shouldAutoDownload, type ConnectionLike } from "@/lib/auto-download-gate";

// Small delay before auto-starting so the download doesn't compete with first paint
// and the initial snapshot warm. It's a bounded-concurrency background fetch either
// way, but a beat of breathing room keeps the first screen snappy.
const AUTO_DOWNLOAD_DELAY_MS = 2000;

/**
 * "Download for offline" control shown in the catalog header. Downloads the data
 * snapshot + all product images to the device (with progress), so reps can browse
 * the full catalog — pictures included — with no signal. Reflects current state:
 * download / downloading… / available offline.
 *
 * AUTO-STARTS ITSELF (2026-08-17): reps won't tap the button, and an online-only device
 * shows broken "?" images the instant it loses signal (verified on-device). So the first
 * time we see an incomplete cache on a connection that looks safe to use, we kick the
 * same download off automatically. The button stays as a manual retry / progress display,
 * and a partial download resumes on the next launch (downloadForOffline skips cached
 * images). Gate logic + the iOS caveat live in lib/auto-download-gate.ts.
 */
export function OfflineDownload() {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OfflineProgress | null>(null);
  const autoTried = useRef(false);

  const refresh = () => offlineStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setProgress({ phase: "data", done: 0, total: 1 });
    try {
      await downloadForOffline((p) => setProgress(p));
      await refresh();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, []);

  // Auto-start (once per session). Fires at most once — a partial/failed run leaves the
  // manual button showing "Finish offline download (X/Y)" and resumes on next launch.
  useEffect(() => {
    if (!status || busy || autoTried.current) return;
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    const connection =
      typeof navigator !== "undefined"
        ? ((navigator as Navigator & { connection?: ConnectionLike }).connection ?? null)
        : null;
    if (!shouldAutoDownload({ online, complete: status.complete, connection })) return;
    autoTried.current = true;
    const t = setTimeout(() => void run(), AUTO_DOWNLOAD_DELAY_MS);
    return () => clearTimeout(t);
  }, [status, busy, run]);

  if (!status) return null;

  const pct =
    progress && progress.phase === "images" && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : null;

  let label: string;
  if (busy) {
    label = progress?.phase === "data" ? "Preparing…" : pct != null ? `Downloading… ${pct}%` : "Downloading…";
  } else if (status.complete) {
    label = "✓ Available offline";
  } else if (status.imagesCached > 0) {
    label = `Finish offline download (${status.imagesCached}/${status.imagesTotal})`;
  } else {
    label = "Download for offline";
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title="Save the whole catalog to this device so it works with no signal"
      style={{
        whiteSpace: "nowrap",
        fontSize: 13,
        fontWeight: 600,
        padding: "7px 12px",
        borderRadius: 6,
        border: "1px solid " + (status.complete ? "#2e7d32" : "#14532d"),
        background: busy ? "#5a5a5a" : status.complete ? "#eaf5ea" : "#14532d",
        color: busy ? "#fff" : status.complete ? "#2e7d32" : "#fff",
        cursor: busy ? "wait" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
