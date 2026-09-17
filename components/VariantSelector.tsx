"use client";

// In-place variant selector (Configurator-first, Slice 1b). For native-variant products
// (one product, real Shopify variants: size × color × …), this replaces the old
// price-box + estimate dropdown with configurator-style button rows that select IN PLACE:
// clicking updates the price and the "Add to Product Estimate" target — no navigation.
// Reuses the .cfg-* button styling so it reads identically to the cross-product configurator.
// Client component → renders the same online and in the offline shell.
import { useState, useEffect } from "react";
import { useSetVariantImage } from "@/components/VariantImage";
import { addLine } from "@/lib/estimate";
import { ESTIMATE } from "@/lib/estimate-config";
import { formatUSD } from "@/lib/helpers";
import {
  resolveVariant,
  initialSelection,
  selectAxisValue,
  type VariantSelector as VSel,
  type ConfigAxis,
} from "@/lib/catalog-shared";
import OfflineImg from "@/components/OfflineImg";

export default function VariantSelector({
  selector,
  navigateAxes = [],
  source,
  slug,
  sourceId = null,
  title,
  image,
}: {
  selector: VSel;
  // Mixed mode (Slice 2): cross-link axes rendered as LINKS above the in-place rows —
  // e.g. CVD Size navigates between products while Color selects in place below.
  navigateAxes?: ConfigAxis[];
  source: "vanity-art" | "toilet";
  slug: string;
  /** Stable the supplier product id, captured so the estimate line survives a the supplier rename (see EstimateLine). */
  sourceId?: string | null;
  title: string;
  image: string | null;
}) {
  const [selection, setSelection] = useState<Record<string, string>>(() => initialSelection(selector));
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = resolveVariant(selector.variants, selection);

  // Keep the gallery in sync with the selection (Slice 1c). Effect, not render-time, so
  // we never set state during render. Null (the supplier has no variant photo) leaves the hero.
  // The SKU goes too, so the gallery can group this variant's OTHER photos behind the
  // hero (the supplier gives some variants 5-6 shots and interleaves them with siblings').
  const setVariantImage = useSetVariantImage();
  useEffect(() => {
    setVariantImage(current?.image ?? null, current?.sku ?? null);
  }, [current?.image, current?.sku, setVariantImage]);

  const price = current?.price ?? null;
  const soldOut = current ? !current.available : false;
  const variantLabel = current
    ? selector.axes.map((ax) => current.optionValues[ax.key]).filter(Boolean).join(" / ")
    : null;

  function choose(key: string, value: string) {
    setSelection(selectAxisValue(selector, selection, key, value).selection);
  }

  async function add() {
    if (price == null || soldOut) return; // sold-out variants are not orderable via the supplier
    setBusy(true);
    try {
      await addLine({
        source,
        slug,
        sourceId,
        title,
        // Capture the SELECTED variant's photo so the estimate/present sheet shows what
        // the rep actually chose; fall back to the product hero when the supplier has none.
        image: current?.image ?? image,
        variantLabel: variantLabel || null,
        sku: current?.sku ?? null,
        unitPrice: price,
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="variant-selector">
      <div className="price-box">
        <div className="lead">Price</div>
        <div className="big">{price == null ? "—" : formatUSD(price)}</div>
        {soldOut ? <div className="note">This option is currently sold out</div> : null}
      </div>

      <div className="configurator">
        {/* Cross-link axes (navigate to a sibling product) — links, like the standalone configurator. */}
        {navigateAxes.map((ax) => (
          <div key={`nav-${ax.key}`} className="cfg-axis">
            <div className="cfg-axis-label">{ax.label}</div>
            <div className="cfg-row">
              {ax.options.map((o, i) => {
                const cls = "cfg-btn" + (o.selected ? " selected" : "") + (o.soldOut ? " soldout" : "");
                const inner = (
                  <>
                    {o.swatch ? <OfflineImg className="cfg-swatch" src={o.swatch} alt="" /> : null}
                    <span>
                      {o.label}
                      {o.soldOut ? " · Sold out" : ""}
                    </span>
                  </>
                );
                return o.selected || o.soldOut ? (
                  <span
                    key={`${o.label}-${i}`}
                    className={cls}
                    aria-current={o.selected ? "true" : undefined}
                    aria-disabled={o.soldOut || undefined}
                  >
                    {inner}
                  </span>
                ) : (
                  <a key={`${o.label}-${i}`} className={cls} href={`/product/${o.targetSlug}`}>
                    {inner}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
        {/* In-place axes (select a variant of THIS product) — stateful buttons. */}
        {selector.axes.map((ax) => (
          <div key={ax.key} className="cfg-axis">
            <div className="cfg-axis-label">{ax.label}</div>
            <div className="cfg-row">
              {ax.values.map((v) => {
                const selected = selection[ax.key] === v.value;
                const cls = "cfg-btn" + (selected ? " selected" : "") + (!v.available ? " soldout" : "");
                return (
                  <button
                    key={v.value}
                    type="button"
                    className={cls}
                    aria-pressed={selected}
                    onClick={() => choose(ax.key, v.value)}
                  >
                    <span>
                      {v.label}
                      {!v.available ? " · Sold out" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="add-estimate" style={{ margin: "16px 0 0" }}>
        <button
          type="button"
          onClick={add}
          disabled={busy || price == null || soldOut}
          style={{
            width: "100%",
            height: 46,
            border: "none",
            borderRadius: 10,
            background: added ? "#2e7d32" : soldOut ? "#9aa5b1" : "var(--brand)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: busy || price == null || soldOut ? "not-allowed" : "pointer",
            transition: "background 120ms",
          }}
        >
          {added ? "✓ Added to Product Estimate" : soldOut ? "Currently sold out" : ESTIMATE.addVerb}
        </button>
      </div>
    </div>
  );
}
