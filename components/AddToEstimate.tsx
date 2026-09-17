"use client";

import { useState } from "react";
import { addLine } from "@/lib/estimate";
import { ESTIMATE } from "@/lib/estimate-config";
import { formatUSD } from "@/lib/helpers";
import { usePriceHidden } from "@/lib/price-visibility";

export interface EstimateOption {
  label: string; // finish/color/config label (may be "" for single-option products)
  unitPrice: number | null; // item+install price; null options are unbuyable/hidden
  sku: string | null;
  available?: boolean; // false = sold out at the supplier → shown but NOT addable to an estimate
}

/**
 * "Add to Product Estimate" — on the product detail page. For multi-finish products
 * (and multi-color toilets) the rep picks the exact option first, so the estimate
 * captures the specific price, not "starting at". Writes to the on-device store
 * (offline-capable). Shows a brief "Added ✓" confirmation.
 */
export default function AddToEstimate({
  source,
  slug,
  sourceId = null,
  title,
  image,
  options,
}: {
  source: "vanity-art" | "toilet";
  slug: string;
  /** Stable the supplier product id, captured so the estimate line survives a the supplier rename (see EstimateLine). */
  sourceId?: string | null;
  title: string;
  image: string | null;
  options: EstimateOption[];
}) {
  const usable = options.filter((o) => o.unitPrice != null);
  const priceHidden = usePriceHidden(); // presentation mode: drop the price from the option labels
  const [idx, setIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  if (usable.length === 0) return null; // nothing priced to add

  const multi = usable.length > 1;
  const chosen = usable[Math.min(idx, usable.length - 1)];
  const chosenSoldOut = chosen?.available === false;

  async function add() {
    if (chosenSoldOut) return; // sold-out items are visible but not orderable via the supplier
    setBusy(true);
    try {
      await addLine({
        source,
        slug,
        sourceId,
        title,
        image,
        variantLabel: chosen.label || null,
        sku: chosen.sku,
        unitPrice: chosen.unitPrice as number,
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="add-estimate" style={{ margin: "16px 0 0" }}>
      {multi && (
        <select
          aria-label="Choose an option"
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          style={{
            width: "100%",
            height: 40,
            padding: "0 10px",
            fontSize: 14,
            border: "1px solid var(--line)",
            borderRadius: 9,
            background: "#fff",
            color: "var(--ink)",
            marginBottom: 10,
          }}
        >
          {usable.map((o, i) => (
            <option key={i} value={i}>
              {(o.label || "Option") +
                (priceHidden ? "" : " — " + formatUSD(o.unitPrice)) +
                (o.available === false ? " · Sold out" : "")}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={add}
        disabled={busy || chosenSoldOut}
        style={{
          width: "100%",
          height: 46,
          border: "none",
          borderRadius: 10,
          background: added ? "#2e7d32" : chosenSoldOut ? "#9aa5b1" : "var(--brand)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          cursor: busy ? "wait" : chosenSoldOut ? "not-allowed" : "pointer",
          transition: "background 120ms",
        }}
      >
        {added ? "✓ Added to Product Estimate" : chosenSoldOut ? "Currently sold out" : ESTIMATE.addVerb}
      </button>
    </div>
  );
}
