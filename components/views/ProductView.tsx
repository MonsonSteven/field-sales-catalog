// Presentational product-detail view. Shared by the online SSR page and the
// offline shell. Pure (no hooks); renders the client Gallery/VariantPricing.
import type { Product, AttributeValue } from "@/schema/types";
import { formatUSD, slugify, type AttrDef } from "@/lib/helpers";
import {
  itemPrice,
  buildVariantSelector,
  contradictorySpecKeys,
  parseVanityDimensions,
  isAllSoldOut,
  NATIVE_WINS_AXES,
  modelOfFamily,
  isMixedEligible,
  type Configurator,
} from "@/lib/catalog-shared";
import Gallery from "@/components/Gallery";
import VariantPricing from "@/components/VariantPricing";
import VariantSelector from "@/components/VariantSelector";
import {
  VariantImageProvider,
  SelectionGallery,
  VariantSku,
  VariantDimensions,
  VariantSpecSheet,
} from "@/components/VariantImage";
import AddToEstimate, { type EstimateOption } from "@/components/AddToEstimate";
import DataFreshness from "@/components/DataFreshness";

function renderValue(v: AttributeValue, unit?: string | null): string {
  const withUnit = (s: string) => (unit ? `${s} ${unit}` : s);
  if (Array.isArray(v)) return v.map((x) => withUnit(String(x))).join(", ");
  return withUnit(String(v));
}

export default function ProductView({
  product,
  defs,
  configurator = null,
  dataAsOf = null,
}: {
  product: Product;
  defs: AttrDef[];
  configurator?: Configurator | null;
  /** When the catalog data was last synced. ISO (server) or epoch-ms string (offline
   *  `snapshot.version`). Drives the rep-facing freshness line under the price. */
  dataAsOf?: string | number | null;
}) {
  const price = itemPrice(product);
  const hasRange =
    product.pricing.priceRange && product.pricing.priceRange.low !== product.pricing.priceRange.high;
  const productSoldOut = isAllSoldOut(product.variants); // every variant unavailable at the supplier

  // Dimensions note (Vanities only; leadership 2026-09). Three-tier source, best first:
  //   1. AUTHORITATIVE per-size W×D×H from the supplier's "3D spec" sheets (lookupVanityDimensions, wired
  //      through VariantDimensions so it follows the rep's size selection) — 7 lines covered.
  //   2. the supplier's PROSE height/depth where the description states them (parseVanityDimensions).
  //   3. A hedged standard note otherwise.
  // The server computes tiers 2/3 here and passes them as the fallback; VariantDimensions picks
  // tier 1 when it has a sheet value for the selected model, else renders that fallback. Skipped
  // on hide_by_default cabinets (linen/tall units): the "standard 34\" vanity" note would be
  // false for a 72" tower, and parseVanityDimensions' sanity bounds reject their out-of-range values.
  const hideByDefault =
    product.attributes?.hide_by_default === true || product.attributes?.hide_by_default === "true";
  const vanityDims =
    product.category === "Vanities" && !hideByDefault ? parseVanityDimensions(product.descriptionHtml) : null;
  const hasRealDims = !!vanityDims && (vanityDims.depth != null || vanityDims.height != null);

  // join normalized variants (option values) with computed prices for the matrix
  const priceBySku = new Map(product.pricing.perVariant.map((v) => [v.sku, v.customerPrice]));
  const combinedVariants = product.variants.map((v) => ({
    sku: v.sourceSku,
    customerPrice: priceBySku.get(v.sourceSku) ?? null,
    optionValues: v.optionValues,
    available: v.available !== false,
  }));
  const labelMap = Object.fromEntries(defs.map((d) => [d.key, d.label]));

  // Configurator-first selection (Slices 1 & 2). The in-place selector replaces the static
  // price-box + estimate dropdown; its axes drop from the Spec table; the full matrix
  // collapses into an "All options & pricing" disclosure.
  //  - Slice 1 (native): NO cross-link configurator → the in-place selector is the whole
  //    picker (e.g. VA3D mirrors, CVA/CVB vanities).
  //  - Slice 2 (mixed): a cross-link configurator PLUS native variants, for allowlisted
  //    families whose two axis sets are DISJOINT — the cross-link axis navigates between
  //    products while the native axes select in place. Verified 08-03 by running the real
  //    buildConfigurator over the catalog: 62 of 63 configurator products have NO axis
  //    overlap (strict resolution already drops single-value axes, e.g. CVK/CVE whose
  //    members all share one SKU colour suffix). Families are enabled one at a time and
  //    eyeballed. The ONE genuine overlap is `CVH54D-VG` (cross-link size AND native size)
  //    — CVH is deliberately LAST: its singles are per-size products (colour native) while
  //    its doubles are per-colour products (size native), so the split flips inside one
  //    family. Decision when we get there: NATIVE wins for size on the CVH54D doubles.
  //    CVG note: its Top Material is a NATIVE axis (e.g. CVG60D-T-BT itself carries both
  //    Black Limestone $5,082 and White Engineered Marble $4,955 — the title says "…or…").
  //    The 07-31 strict fix correctly stopped a size-jump but also hid that real choice;
  //    in-place selection restores it properly (price updates, no navigation).
  //    CVL note: only the 3 `CVL20-DG-*` products actually change — the richest page in the
  //    catalog (54 variants, all priced + in stock, 18 distinct prices $2.6k–$9.7k): Handle
  //    navigates, Colour(6) × Size(8) × Style(2) select in place. CVL84D-* have no second
  //    axis, and CVL-LC/TC/HANDLE are their own single-member families already on Slice 1.
  //    CVI note: unblocked once G1 shipped — its native axes are size/handle_finish/style
  //    (the supplier mislabels the handle axis "Colour"; G1 remaps it), so they no longer collide with
  //    the cross-link Colour axis. Colour navigates, the rest select in place.
  //    The policy itself now lives in `lib/catalog-shared.ts` (MIXED_SELECTOR_MODELS /
  //    NATIVE_WINS_AXES / modelOfFamily) so it is unit-testable — it was keyed by FAMILY
  //    here and silently excluded subtype families like `CVI-TC`/`CVI-LC`.
  const rawSelector = buildVariantSelector(product, labelMap);
  const model = configurator ? modelOfFamily(configurator.family) : "";
  const mixedEligible = isMixedEligible(configurator?.family, !!rawSelector?.axes.length);
  const nativeKeys = new Set<string>(rawSelector ? rawSelector.axes.map((a) => a.key) : []);
  const nativeWins = new Set<string>(configurator ? NATIVE_WINS_AXES[model] ?? [] : []);
  // Cross-link axes still rendered as links: drop any the native side owns for this family.
  const navAxes = mixedEligible
    ? configurator!.axes.filter((a) => !(nativeWins.has(a.key) && nativeKeys.has(a.key)))
    : (configurator?.axes ?? []);
  const navKeys = new Set<string>(navAxes.map((a) => a.key));
  const selector = !configurator
    ? rawSelector
    : mixedEligible
      ? { ...rawSelector!, axes: rawSelector!.axes.filter((a) => !navKeys.has(a.key)) } // dedup vs cross-link
      : null;
  const selectorHasAxes = selector != null && selector.axes.length > 0;
  const nativeMode = !configurator && selectorHasAxes;
  const mixedMode = configurator != null && selectorHasAxes;
  const selectorMode = nativeMode || mixedMode;
  // Suppress spec rows for every axis the picker now covers (in-place + cross-link), plus
  // any product-level row that a per-variant reality would contradict (2026-08-06 —
  // `sink_config` on a mixed-bowl vanity; see contradictorySpecKeys).
  const axisKeys = new Set<string>([
    ...(selector ? selector.axes.map((a) => a.key) : []),
    ...(mixedMode ? [...navKeys] : []),
    ...contradictorySpecKeys(product),
  ]);
  const visibleDefs = defs.filter((d) => !axisKeys.has(d.key));
  const pricedVariantCount = combinedVariants.filter((v) => v.customerPrice != null).length;

  // Options for "Add to Product Estimate": a manual override collapses to one price;
  // otherwise one option per priced variant (rep picks the finish → exact price).
  const estimateOptions: EstimateOption[] =
    product.pricing.manualOverride != null
      ? [{ label: "", unitPrice: product.pricing.manualOverride, sku: product.sourceSku }]
      : combinedVariants.length
        ? combinedVariants.map((v) => ({
            label: Object.values(v.optionValues || {}).join(" / "),
            unitPrice: v.customerPrice,
            sku: v.sku,
            available: v.available,
          }))
        : [{ label: "", unitPrice: product.pricing.startingAt ?? null, sku: product.sourceSku }];

  // Selector mode wraps the detail block so the in-place selection can drive the gallery
  // (Slice 1c). The provider is a client component but takes server-rendered children, so
  // the `.detail` grid and the whole info column are unchanged.
  const Detail = selectorMode ? VariantImageProvider : ({ children }: { children: React.ReactNode }) => <>{children}</>;

  return (
    <Detail>
      <div className="crumb">
        <a href="/">Home</a> /{" "}
        <a href={`/category/${slugify(product.category)}`}>{product.category}</a> / {product.title}
      </div>

      <div className="detail">
        {/* Left column: gallery + the Spec Sheet button beneath it. Wrapped in one grid cell so
            the button tracks the gallery, and (in selector mode) sits inside the provider so it
            follows the rep's size/finish selection. */}
        <div>
          {selectorMode ? (
            <SelectionGallery images={product.images.gallery} title={product.title} />
          ) : (
            <Gallery images={product.images.gallery} title={product.title} />
          )}
          <VariantSpecSheet productSku={product.sourceSku} />
        </div>

        <div>
          <span className="badge">{product.category}</span>
          <h1>{product.title}</h1>
          {/* Follows the rep's selection (CEO, 2026-08-07). VariantSku reads the SKU the
              selector publishes into VariantImageContext — the same channel the gallery has
              used since Slice 1c — and falls back to the product's own SKU. Safe outside
              selector mode too: the provider isn't mounted there, so the context default
              yields null and the fallback renders exactly what this line showed before. */}
          <div className="sku">
            SKU <VariantSku productSku={product.sourceSku} /> · {product.partner}
          </div>

          {productSoldOut ? (
            <div className="soldout-note" role="status">
              Currently sold out at the manufacturer
            </div>
          ) : null}

          {selectorMode ? (
            <VariantSelector
              selector={selector!}
              navigateAxes={mixedMode ? navAxes : undefined}
              source="vanity-art"
              slug={product.slug}
              sourceId={product.source?.id != null ? String(product.source.id) : null}
              title={product.title}
              image={product.images.primary}
            />
          ) : (
            <div className="price-box">
              <div className="lead">{hasRange ? "Starting at" : "Price"}</div>
              <div className="big">{formatUSD(price)}</div>
              {hasRange ? (
                <div className="note">
                  Ranges to {formatUSD(product.pricing.priceRange!.high)} depending on options
                </div>
              ) : null}
            </div>
          )}

          {/* How old is this stock/pricing? Rep-facing only — availability moves daily. */}
          <DataFreshness value={dataAsOf} />


          {visibleDefs.length > 0 ? (
            <>
              <div className="section-label">Specifications</div>
              <table className="spec">
                <tbody>
                  {visibleDefs.map((d) => {
                    const val = product.attributes[d.key];
                    if (val == null) return null;
                    return (
                      <tr key={d.key}>
                        <th>{d.label}</th>
                        <td>{renderValue(val, d.type === "number" ? d.unit : null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          ) : null}

          {vanityDims ? (
            <p
              className="dim-note"
              style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}
            >
              <strong style={{ fontWeight: 600, color: "var(--ink)" }}>Standard dimensions:</strong>{" "}
              {/* Prefer the authoritative per-size sheet value (VariantDimensions, reactive to the
                  rep's size selection); fall back to the supplier's prose dims, then the hedged standard. */}
              <VariantDimensions
                productSku={product.sourceSku}
                fallback={
                  hasRealDims ? (
                    <>
                      {vanityDims.height != null ? `${vanityDims.height}″ H` : null}
                      {vanityDims.height != null && vanityDims.depth != null ? " × " : null}
                      {vanityDims.depth != null ? `${vanityDims.depth}″ D` : null}. Width varies with the
                      size selected.
                    </>
                  ) : (
                    <>
                      vanities are typically built to a 34″ height and 22″ depth, with width varying by the
                      size selected. Confirm exact dimensions for this model.
                    </>
                  )
                }
              />
            </p>
          ) : null}

          {product.descriptionText ? (
            <>
              <div className="section-label">Description</div>
              {/* Plain text only — raw partner HTML is NOT rendered (XSS-safe per security directive). */}
              <p className="desc">{product.descriptionText}</p>
            </>
          ) : null}

          {selectorMode ? (
            // Full matrix kept for transparency, but subordinated to the selector above.
            pricedVariantCount > 1 ? (
              <details className="all-options price-private">
                <summary className="section-label" style={{ cursor: "pointer" }}>
                  All options &amp; pricing
                </summary>
                <VariantPricing variants={combinedVariants} labels={labelMap} />
              </details>
            ) : null
          ) : (
            <>
              <VariantPricing variants={combinedVariants} labels={labelMap} />

              <AddToEstimate
                source="vanity-art"
                slug={product.slug}
                sourceId={product.source?.id != null ? String(product.source.id) : null}
                title={product.title}
                image={product.images.primary}
                options={estimateOptions}
              />
            </>
          )}
        </div>
      </div>
    </Detail>
  );
}
