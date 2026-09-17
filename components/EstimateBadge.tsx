"use client";

import { useEstimateCount } from "@/lib/estimate";
import { ESTIMATE } from "@/lib/estimate-config";

/** Header chip showing the active Product Estimate's line count; links to /estimate.
 *  Live-updates as the rep adds items (offline-capable — reads IndexedDB). */
export default function EstimateBadge() {
  const n = useEstimateCount();
  const filled = n > 0;
  return (
    <a
      href="/estimate"
      title={ESTIMATE.featureName}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        fontWeight: 600,
        padding: "7px 12px",
        borderRadius: 6,
        border: "1px solid var(--brand)",
        background: filled ? "var(--brand)" : "#fff",
        color: filled ? "#fff" : "var(--brand)",
        whiteSpace: "nowrap",
        textDecoration: "none",
      }}
    >
      Estimate{filled ? ` (${n})` : ""}
    </a>
  );
}
