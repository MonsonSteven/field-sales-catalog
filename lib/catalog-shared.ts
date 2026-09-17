/**
 * catalog-shared.ts — PURE, isomorphic catalog derivations over full Product[]
 * records. Runs identically on the server (from Payload docs mapped to Products)
 * and on the client (from the Dexie-cached snapshot), so the offline catalog is
 * derived by the SAME code that renders it online. No I/O, no server-only imports.
 */
import type { Product } from "@/schema/types";
import {
  slugify,
  type CatalogItem,
  type CategorySummary,
  type FilterDef,
  type AttrDef,
  type ItemAttributeValue,
} from "./helpers";
import { VANITY_DIMENSIONS, type VanityDim } from "./vanity-dimensions.data";
import { SPEC_SHEETS } from "./spec-sheets.data";

/** Curated tile image per category, chosen by preferred product SKU (overrides the
 *  default "first published product with an image"). Shared so server + client
 *  compute identical category samples. */
export const PREFERRED_SAMPLE_SKU: Record<string, string> = {
  accessories: "CVL-HANDLE-BN-1#", // VA91 handle — cleaner than the default sink image
};

/** display price = manual override (authored) wins over the formula's starting-at */
export function itemPrice(p: Product): number | null {
  return p.pricing.manualOverride ?? p.pricing.startingAt ?? null;
}

/**
 * Base/add-on units (bare cabinets, wall/floor storage, side cabinets) carry `hide_by_default` —
 * they are NOT complete top+sink vanities, per Steven's curated review (the pipeline sets the
 * flag). Reps must never see them: they're filtered from the Vanities browse AND (since the
 * 2026-09 leadership request removing the reveal toggle) from global + offline SEARCH results, so
 * a colour/size search can't surface them either. The product page still resolves if linked
 * directly (e.g. from a configurator) — this gates DISCOVERY, not access. Self-scopes to Vanities:
 * only they carry the flag. The canonical rule — used by browse and both search paths so they
 * cannot drift.
 */
export function isHiddenByDefault(item: Pick<CatalogItem, "attributes">): boolean {
  const v = item.attributes?.["hide_by_default"];
  return v === true || v === "true";
}

/** Every orderable variant is sold out at the supplier (no stock). True only when there IS at least one
 *  variant and ALL of them are explicitly unavailable — an empty/absent list is NOT "sold out"
 *  (we don't know), and a single available variant keeps the product orderable. `available` is
 *  treated as available unless it is exactly `false` (mirrors the selectors' own convention). */
export function isAllSoldOut(variants: ReadonlyArray<{ available?: boolean }> | null | undefined): boolean {
  return Array.isArray(variants) && variants.length > 0 && variants.every((v) => v?.available === false);
}

/** Sort key that sinks sold-out tiles to the BOTTOM (available = 0, sold out = 1) so reps see
 *  what they can actually sell first. Use as the PRIMARY comparator, then the chosen sort:
 *  `soldOutRank(a) - soldOutRank(b) || <price/name compare>`. Shared by browse + search. */
export function soldOutRank(item: { soldOut?: boolean }): 0 | 1 {
  return item.soldOut ? 1 : 0;
}

/** Full Product -> slim listing item (matches server toItem). */
export function productToItem(p: Product): CatalogItem {
  return {
    slug: p.slug,
    title: p.title,
    category: p.category,
    sku: p.sourceSku ?? null,
    image: p.images.primary ?? null,
    tags: p.tags ?? [],
    price: itemPrice(p),
    priceLow: p.pricing.priceRange?.low ?? null,
    priceHigh: p.pricing.priceRange?.high ?? null,
    attributes: p.attributes ?? {},
    soldOut: isAllSoldOut(p.variants),
  };
}

/** Aggregate categories with counts + a sample image (mirrors server getCategories). */
export function deriveCategories(products: Product[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>();
  const lockedSample = new Set<string>();
  for (const p of products) {
    const name = p.category;
    if (!name) continue;
    const slug = slugify(name);
    if (!map.has(name)) map.set(name, { name, slug, count: 0, sample: null });
    const c = map.get(name)!;
    c.count++;
    const image = p.images.primary ?? null;
    if (image) {
      if (PREFERRED_SAMPLE_SKU[slug] && p.sourceSku === PREFERRED_SAMPLE_SKU[slug]) {
        c.sample = image; // curated pick wins and locks
        lockedSample.add(name);
      } else if (!c.sample && !lockedSample.has(name)) {
        c.sample = image; // default: first product with an image
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function categoryBySlug(products: Product[], slug: string): CategorySummary | null {
  return deriveCategories(products).find((c) => c.slug === slug) ?? null;
}

export function itemsByCategorySlug(products: Product[], slug: string): CatalogItem[] {
  return products.filter((p) => slugify(p.category) === slug).map(productToItem);
}

export function productBySlug(products: Product[], slug: string): Product | null {
  return products.find((p) => p.slug === slug) ?? null;
}

/** Resolve within a snapshot by the STABLE the supplier product id — the offline twin of getProductBySourceId,
 *  used to recover an estimate line whose slug changed when the supplier renamed the product. */
export function productBySourceId(products: Product[], sourceId: string | null | undefined): Product | null {
  if (!sourceId) return null;
  return products.find((p) => p.source?.id != null && String(p.source.id) === sourceId) ?? null;
}

/** Attribute defs for a category, ordered (mirrors server getAttrDefs). */
export function attrDefsForCategory(attrDefs: AttrDef[], category: string): AttrDef[] {
  return attrDefs.filter((d) => d.category === category).sort((a, b) => a.order - b.order);
}

/**
 * Spec-row keys whose PRODUCT-level value would contradict the variant the rep has
 * selected, and must therefore not render (2026-08-06).
 *
 * `sink_config` is Artisan Bath Co.'s product-level "Single"/"Double" facet. On a product whose
 * bowl count genuinely varies by variant, that single value is wrong for some of them by
 * construction — a 96-inch double reading "Sink Configuration: Single" while the picker
 * says otherwise. Exactly the failure retired with the `tub_size` row on 08-04.
 *
 * Keyed off the PRICING summary rather than off the picker's axes deliberately: bowl count
 * varies two different ways (a `style` axis the rep picks, and a size ladder with no axis
 * at all), and `pricing.bowlCount === "mixed"` is the one signal that catches both. It is
 * computed from Steven's hand-verified data, so this follows the measured truth rather
 * than re-deriving it in the view.
 */
export function contradictorySpecKeys(product: Product): string[] {
  return product.pricing?.bowlCount === "mixed" ? ["sink_config"] : [];
}

/**
 * Filterable enum attributes -> UI filter groups (mirrors server getFilterDefs).
 *
 * Pass `items` to drop DEAD filters. AttributeDefinitions are derived from the source feed
 * but the sync only creates/updates them — it never deletes — so an axis that gets renamed
 * (e.g. the 2026-08-04 remaps of `handle_color`→`handle_finish` and `quanity`→`style`)
 * leaves an orphaned definition behind. Orphans are still `filterable` with ≥2 options, so
 * the rail would render a filter that matches ZERO products. Keeping a definition only when
 * some item actually carries the key is self-healing for any past or future orphan, and is
 * non-destructive (admin-edited labels / filterable flags survive).
 */
// Filter keys deliberately kept OUT of the rail even though the data is filterable — internal the supplier
// line codes (e.g. "series": CVM/CVG/CVL…) a rep or customer wouldn't recognise. Reinstate by
// removing the key here. (2026-08-18: series pulled for the pilot — reps merchandise by
// size/colour/price/sink, never by the supplier line code.)
// (2026-09-02: "sink" — the Base (No Sink) / With Sink facet — pulled at leadership's request; base
// units are now never shown to reps anyway (hide_by_default), so the facet only ever offered "With
// Sink". Keep "sink_config" (Single/Double), which is different and useful. Reinstate by removing.)
export const FILTER_KEY_DENYLIST = new Set<string>(["series", "sink"]);

/** Values actually present per attribute key across the given items. */
function presentValuesByKey(items: Pick<CatalogItem, "attributes">[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const i of items) {
    for (const [k, v] of Object.entries(i.attributes ?? {})) {
      const arr = Array.isArray(v) ? v : [v];
      let set = m.get(k);
      if (!set) m.set(k, (set = new Set()));
      for (const x of arr) if (x != null) set.add(String(x));
    }
  }
  return m;
}

/**
 * Shape a category's attribute defs into rail filters — shared by the server (getFilterDefs) and
 * offline (filterDefsForCategory) builders so they can't drift. Keeps filterable enum defs with
 * ≥2 options (minus the denylist) whose KEY a visible item carries, and PRUNES each facet's options
 * to values actually present on a visible item. Without the prune the rail offered values matching
 * ZERO visible products (e.g. `series: CVN`, `size: 108/96/11 inch` after products were hidden —
 * 2026-08-18). Facet retention stays key-level (unchanged); only dead OPTIONS are removed.
 * `items` undefined = no pruning (back-compat).
 */
export function shapeFilterDefs(defs: AttrDef[], items?: Pick<CatalogItem, "attributes">[]): FilterDef[] {
  const present = items ? presentValuesByKey(items) : null;
  const out: FilterDef[] = [];
  for (const d of defs) {
    if (!d.filterable || d.type !== "enum" || d.options.length < 2) continue;
    if (FILTER_KEY_DENYLIST.has(d.key)) continue;
    if (!present) {
      out.push({ key: d.key, label: d.label, options: d.options, order: d.order });
      continue;
    }
    const live = present.get(d.key);
    if (!live) continue; // no visible item carries this key (dead facet)
    const options = d.options.filter((o) => live.has(o)); // drop values matching zero visible items
    if (!options.length) continue;
    out.push({ key: d.key, label: d.label, options, order: d.order });
  }
  return out;
}

/** Attribute defs → rail filters for a category (offline/isomorphic). See shapeFilterDefs. */
export function filterDefsForCategory(
  attrDefs: AttrDef[],
  category: string,
  items?: Pick<CatalogItem, "attributes">[],
): FilterDef[] {
  return shapeFilterDefs(attrDefsForCategory(attrDefs, category), items);
}

/**
 * Normalize a search fragment so number+unit spellings unify: `96"`, `96”`, `96″`, `96in`,
 * `96 inch`, `96 inches` and bare `96` all reduce to a token containing `96`. Applied to BOTH
 * the haystack and the query, so any of those spellings a rep types matches any the data uses
 * (the supplier writes `96"` in titles but `96 inch` in the size attribute). Lowercased; punctuation →
 * spaces; whitespace collapsed. Pure.
 */
export function normalizeSearchText(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/(\d)\s*(?:"|”|″|inches|inch|in|ft|feet|')\b/g, "$1") // strip a unit right after a number
    .replace(/[^a-z0-9.]+/g, " ") // everything else (incl. leftover quotes, ×, x, -) → space
    .replace(/\s+/g, " ")
    .trim();
}

/** Attribute VALUES of an item as plain strings (arrays flattened, nulls dropped). */
function attrValues(attributes: Record<string, ItemAttributeValue> | null | undefined): string[] {
  return Object.values(attributes ?? {})
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v) => v != null)
    .map(String);
}

/** Build a normalized search haystack from raw fields: title + SKU + tags + every attribute
 *  value (size/color/finish/sink…). This is what lets a rep search by size or colour, not just
 *  name/SKU. Pure. */
export function buildSearchText(
  title: string,
  sku: string | null | undefined,
  tags: string[] | null | undefined,
  attributes: Record<string, ItemAttributeValue> | null | undefined,
): string {
  return normalizeSearchText([title, sku ?? "", ...(tags ?? []), ...attrValues(attributes)].join(" "));
}

/** The normalized free-text haystack for one catalog item. Prefers a precomputed `searchText`
 *  (set on collapsed group tiles, carrying every member's title/SKU so the tile is findable by
 *  any size it offers); otherwise derives it from the item's own fields. */
export function itemSearchText(item: CatalogItem): string {
  return item.searchText ?? buildSearchText(item.title, item.sku, item.tags, item.attributes);
}

/** Does an item match a free-text query? Both sides normalized (see normalizeSearchText). An
 *  empty/whitespace query matches everything (callers decide whether to search at all). */
export function itemMatchesQuery(item: CatalogItem, query: string): boolean {
  const term = normalizeSearchText(query);
  return term ? itemSearchText(item).includes(term) : true;
}

/** Title / SKU / tags / ATTRIBUTE search, cheapest first (mirrors server searchAllItems).
 *  Now searches attribute values (size/colour/…) and normalizes units, so `96"` finds 96-inch
 *  products. Operates on individual products (ungrouped) — each carries its own size in its
 *  title, so global search finds every size directly; the browse grid's collapsed tiles get the
 *  member-title haystack via applyBrowseGroups instead. */
export function searchItems(products: Product[], query: string): CatalogItem[] {
  const term = normalizeSearchText(query);
  if (!term) return [];
  return products
    .map(productToItem)
    .filter((it) => !isHiddenByDefault(it)) // base/add-on units are never rep-discoverable (see isHiddenByDefault)
    .filter((it) => itemSearchText(it).includes(term))
    .sort((a, b) => soldOutRank(a) - soldOutRank(b) || (a.price ?? Infinity) - (b.price ?? Infinity)); // available first, then cheapest
}

/**
 * Overall depth & height for a vanity, parsed from Artisan Bath Co.'s prose description.
 *
 * ⚠ This is the "decode the supplier's prose" pattern that has bitten this project before, so it is
 * deliberately conservative — it exists to SURFACE a real number when the supplier clearly states one, and
 * to stay SILENT (→ null → the page shows a hedged standard note) otherwise. It never guesses.
 *
 * the supplier has no structured dimension field; it publishes W×D×H only in the description, for ~⅔ of
 * vanities, in two shapes (verified 2026-09-02 across all 174 published vanities):
 *   A  "…Specifications Width 84\" Depth 22\" Height 34\" Cabinet Material…"  (label then value)
 *   B  "…Vanity 30 inches width x 18.3 inches depth x 34.5 inches height…"    (value then label)
 * Width is intentionally NOT returned — it is the size the picker already shows.
 *
 * SANITY BOUNDS are load-bearing: they reject the CVI/CVL linen- and tall-cabinet members
 * (72" tall, 8" deep) that live in the Vanities category but are not complete vanities, so we
 * never print "Height 72\"" on a vanity page. A value outside the bound is treated as absent.
 */
export function parseVanityDimensions(descriptionHtml: string | null | undefined): {
  depth: number | null;
  height: number | null;
} {
  const t = String(descriptionHtml ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&(?:quot|#34);/gi, '"') // the supplier uses literal " but decode the entity form defensively
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
  const first = (...res: RegExp[]): number | null => {
    for (const re of res) {
      const m = re.exec(t);
      if (m) return parseFloat(m[1]);
    }
    return null;
  };
  const depth = first(/depth\s*([\d.]+)\s*(?:"|”|″)/i, /([\d.]+)\s*(?:inches?|"|”|″)\s*depth/i);
  const height = first(/height\s*([\d.]+)\s*(?:"|”|″)/i, /([\d.]+)\s*(?:inches?|"|”|″)\s*height/i);
  return {
    depth: depth != null && depth >= 12 && depth <= 36 ? depth : null, // plausible vanity depth
    height: height != null && height >= 28 && height <= 48 ? height : null, // plausible vanity height
  };
}

/**
 * Authoritative overall cabinet dimensions (W×D×H, inches) for the model a vanity SKU
 * belongs to, from VANITY_DIMENSIONS (extracted from the supplier's per-line "3D spec" sheets). This
 * is the precise, per-size upgrade to parseVanityDimensions' prose guess: the caller looks
 * here FIRST and falls back to the prose/hedged note when this returns null. Pure — safe
 * online + offline (no I/O; the map is bundled).
 *
 * SKU→model grammar (verified against all 582 covered-line SKUs, 2026-09-11):
 *   standard : [LINE][SIZE][D|S?]-…     CVL36D-VG-BN → CVL36D
 *   subtype  : [LINE]-LC | -TC -…       CVI-LC-DG-BN → CVI-LC   (linen / tall cabinet)
 *   alias    : CVM1148… → CVM48         the supplier glued the "11" serial into the 48" SKU (same
 *                                        typo the pricing layer already special-cases)
 * A bare-60" SKU (CVL60-DG-BN = 60" DOUBLE in Gray — the "D" rides the colour segment, the
 * CVL60-DG lesson) carries no D/S on the SIZE, so we also try …D / …S. Single vs double is
 * sink count, not cabinet size: both share identical W×D×H (verified in the source sheets),
 * so this can only ever resolve to the correct dimensions, never a wrong size.
 *
 * Returns null for any model with no sheet value (CVA/CVB/CVC/CVF — the un-decoded the supplier####
 * renames — and edge sizes like CVL84D), which is not an error: it just means "fall back".
 */
export function lookupVanityDimensions(sku: string | null | undefined): VanityDim | null {
  const s = String(sku ?? "").toUpperCase();
  if (!s) return null;
  const sub = /^(CV[A-Z]-(?:LC|TC))/.exec(s);
  let key: string | null;
  if (sub) key = sub[1];
  else if (/^CVM1148/.test(s)) key = "CVM48";
  else {
    const m = /^([A-Z]+\d+[DS]?)/.exec(s);
    key = m ? m[1] : null;
  }
  if (!key) return null;
  const base = key.replace(/[DS]$/, "");
  const candidates = key === base ? [key] : [key, base];
  if (/\d$/.test(base)) candidates.push(base + "D", base + "S");
  for (const c of candidates) {
    if (VANITY_DIMENSIONS[c]) return VANITY_DIMENSIONS[c];
  }
  return null;
}

/**
 * Path to the downloadable spec-sheet PDF for a vanity SKU, or null when we have no sheet for
 * that model (→ the product page shows no "Spec Sheet" button; never a dead link). The set of
 * available sheets is SPEC_SHEETS (generated from public/specs/); the file is served same-origin
 * at `/specs/<KEY>.pdf` so the service worker can cache it for offline (a cross-origin Blob URL
 * could not be intercepted on a top-level open). Pure — safe online + offline.
 *
 * SKU→key, most→least specific (the supplier ships sheets at TWO granularities, so we try both):
 *   subtype  : CVI-LC-DG-BN → CVI-LC
 *   finish   : CVF24WF      → CVF24WF   (the CVF line has a sheet PER finish; the finish letters
 *                                         ride the leading token, no hyphen — so the whole leading
 *                                         token is the most-specific key)
 *   explicit : CVI60S-NO-BN → CVI60S    (D/S in the size token — used verbatim)
 *   alias    : CVM1148…     → CVM48     (the supplier's glued-serial typo)
 *   size     : CVA24-DG-BN  → CVA24     (most lines: one sheet per size)
 *   marker   : CVL60-DG-BN  → CVL60D  ·  VA2060-SE → VA2060S
 * For a BARE size (no D/S in the token) we read the double/single marker from the FIRST letter of
 * the segment after the size — "D…" = double, "S…" = single (the CVL60-DG = "60 Double" lesson) —
 * so a single never grabs the double's sheet. The plain size sheet is tried before that guess, so
 * a size sold in only one config (CVL20, CVI48) resolves directly. First candidate present wins.
 */
export function lookupSpecSheet(sku: string | null | undefined): string | null {
  const s = String(sku ?? "").toUpperCase();
  if (!s) return null;
  const candidates: string[] = [];
  const sub = /^(CV[A-Z]-(?:LC|TC))/.exec(s);
  if (sub) {
    candidates.push(sub[1]);
  } else {
    if (/^CVM1148/.test(s)) candidates.push("CVM48");
    const lead = s.split("-")[0];
    candidates.push(lead); // finish-level (CVF24WF), explicit-D/S (CVI60S), or bare size (CVA24 / CVL60)
    const m = /^([A-Z]+\d+[DS]?)/.exec(s);
    if (m) candidates.push(m[1]);
    const base = (m ? m[1] : lead).replace(/[DS]$/, "");
    const seg = s.split("-")[1] ?? ""; // segment after the size carries the bare-size D/S marker
    if (seg.startsWith("D")) candidates.push(base + "D");
    else if (seg.startsWith("S")) candidates.push(base + "S");
    candidates.push(base);
    if (/\d$/.test(base)) candidates.push(base + "D", base + "S");
  }
  for (const c of candidates) {
    if (SPEC_SHEETS.has(c)) return `/specs/${c}.pdf`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Product Configurator (see CONFIGURATOR-SPEC.md)
 * Derive a model FAMILY + its option AXES from SKUs at read-time — pure
 * + isomorphic, so it works online and offline (SKUs are in the snapshot),
 * with no re-pull. Artisan Bath Co. has no config engine: options are separate
 * products cross-linked by SKU. Axes vary by model:
 *   vanities  : size × sink-config × color × top-material
 *   cabinets  : color × handle   (CVI/CVL — no size axis)
 * SKU grammar (verified 2026-07-30):
 *   vanity  : [MODEL][SIZE][D|S?]-[COLOR]-[TOP?]        e.g. CVG72D-LW-BT
 *   cabinet : [MODEL]-[SUBTYPE]-[COLOR]-[HANDLE]        e.g. CVI-LC-DG-BN
 * ------------------------------------------------------------------ */

const COLOR_LABELS: Record<string, string> = {
  LW: "Light Wheat", T: "Tan", SG: "Silver Gray", VG: "Vintage Green",
  DG: "Driftwood Gray", NO: "Natural Oak", G: "Gray", W: "White", WALNUT: "Walnut",
};
const TOP_LABELS: Record<string, string> = { ET: "Engineered Marble", BT: "Black Limestone" };
const HANDLE_LABELS: Record<string, string> = { BN: "Brushed Nickel", GB: "Golden Brushed", MB: "Matte Black" };

// Allowlist: only these verified vanity/cabinet model prefixes get a configurator.
// Other product types (bathtubs "B", mirrors "the supplier…", shower doors "SH", saunas "VAS",
// sinks "BS", and CV cabinets whose SKU grammar we haven't verified — CVJ/CVF) don't fit
// this grammar, so their segments would mis-parse into bogus axes. They keep their native
// variants instead. Expand this set as more families are verified.
const CONFIGURATOR_MODELS = new Set(["CVG", "CVE", "CVH", "CVK", "CVI", "CVL", "CVD", "CVB", "CVC", "CVF"]);

/**
 * MODULAR LINES (CVB/CVC) — added 2026-08-07. These need their own grammar, and the reason
 * is worth reading before touching any of it.
 *
 * Artisan Bath Co. has been splitting these lines from ONE listing with a size axis into ONE
 * PRODUCT PER SIZE. That is not a data problem — prices and photos are right — but the
 * relationship between the sizes is gone, so a rep has to back out to the category list to
 * show the next size up. 18 published products are in this state (CVB24 since 06 Aug, CVB30
 * and CVB36 since 07 Aug). CVC is unsplit so far.
 *
 * ⚠ WHY THEY WERE EXCLUDED, AND WHY "JUST ALLOWLIST THEM" WOULD HAVE BEEN A DISASTER.
 * The generic vanity grammar reads segment 0 as MODEL+SIZE. For these lines segment 0 is
 * MODEL+**MODULE WIDTH**, and the real size lives in segment 1. Run through the old parse:
 *     CVB36-108B -> { family:"CVB", size:36,  color:"108b" }   // a 108" vanity, read as 36"
 *     CVB30-96G  -> { family:"CVB", size:30,  color:"96g"  }
 * Three silent failures at once: size takes the module width, the real size is swallowed
 * into `color` as a bogus finish name, and CVB24/CVB30/CVB36 — three distinct product
 * lines — collapse into one family. It does not FAIL; it returns a confident, well-formed,
 * wrong answer that would look plausible on screen. Hence `family` here is MODEL+MODULE
 * ("CVB36"), never the bare model.
 *
 * ⚠ SIZE COMES FROM THE TITLE, NOT THE SKU — deliberately, and this is the crux.
 * The SKU omits the size digits when the size equals the module width, but only on some
 * lines:  CVB36-B = 36"  ·  CVB36-108B = 108"  ·  CVB30-B = 30"  ·  but CVB24-24G = 24",
 * where the digits ARE written. The same concept, encoded three ways across three sibling
 * lines. Titles carry it unambiguously (`108" Bathroom Vanity …`), and this project's own
 * rule — earned on CVL60-DG-BN, which is 60" Double in Gray, not Driftwood Gray — is to
 * never key on parsing a SKU when a reliable field exists.
 *
 * So the SKU digits are used only as a CROSS-CHECK: when present and they disagree with the
 * title, we refuse to parse rather than pick a winner. And with no title we return null,
 * which simply means "no configurator" — the current, safe behaviour.
 */
const MODULAR_LINE_MODELS = new Set(["CVB", "CVC"]);

/** The size a per-size product's title declares, e.g. `108" Bathroom Vanity …` -> 108. */
function sizeFromTitle(title: string | null | undefined): number | null {
  const m = /^\s*(\d{1,3})\s*(?:"|”|-?\s*inch)/i.exec(title ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * What `parseSku` may be given as its second argument.
 *
 * It started as just a SKU string, then took a TITLE (2026-08-07, for the modular CVB/CVC
 * lines whose SKUs carry the module width rather than the size). It now optionally takes the
 * whole product, because 2026-08-10 proved the title is ALSO insufficient: `CVL72-DDG-MB` is
 * a DOUBLE and its title says nothing about sink at all, as do seven of its nine siblings.
 * The reliable answer lives in Artisan Bath Co.'s own `sink_config` attribute.
 *
 * A plain string is still accepted and read as the title, so every existing caller and test
 * keeps working unchanged.
 */
type SkuContext =
  | string
  | { title?: string | null; attributes?: Record<string, unknown> | null }
  | null
  | undefined;

const ctxTitle = (c: SkuContext): string | null =>
  typeof c === "string" ? c : (c?.title ?? null);

/**
 * The sink configuration of a whole product, most authoritative source first.
 *
 * ORDER MATTERS and is evidence-driven (2026-08-10, measured across all 25 new CVL/CVF
 * products): the supplier's `sink` / `sink_config` attributes are populated correctly on every one of
 * them, while the TITLE is silent on 8 — including `CVL72-DDG-MB`, a double whose title never
 * says so. Reading the title first would have mislabelled it single.
 *
 * ⚠ NEVER parse this from the SKU. `CVL60-DG-MB` is **D**ouble + **G**ray, not Driftwood
 * Gray; `CVL60-SG-MB` is **S**ingle + **G**ray, which would otherwise read as "Silver Gray" —
 * a real finish in our vocabulary that this line does not sell. That is the whole trap.
 */
function sinkFromContext(c: SkuContext): "single" | "double" | "base" | null {
  const attrs = typeof c === "string" ? null : (c?.attributes ?? null);
  const sink = attrs?.["sink"];
  if (typeof sink === "string" && /base|no sink/i.test(sink)) return "base";
  const cfg = attrs?.["sink_config"];
  // A genuinely-mixed vanity carries sink_config as an ARRAY (["Single","Double"], written by
  // applyPricing so the filter matches it under both options). There is no single product-level
  // answer, so don't fall through and guess from the title — return null and let per-variant
  // resolution decide. (During the pipeline this reads the raw string; the array only exists on
  // the stored product post-pricing, but guarding here keeps every caller safe either way.)
  if (Array.isArray(cfg)) return null;
  if (typeof cfg === "string") {
    if (/double/i.test(cfg)) return "double";
    if (/single/i.test(cfg)) return "single";
  }
  const t = ctxTitle(c) ?? "";
  if (/double\s*sink/i.test(t)) return "double";
  if (/single\s*sink/i.test(t)) return "single";
  return null;
}

/**
 * CVF — resin vanity tops. `CVF{size}[D]W{F|L}`, e.g. CVF60DWF, CVF48WL, CVF11WL.
 *
 * TWO SEPARATE FAMILIES, and that is a deliberate product decision (Steven, 2026-08-10, after
 * checking the supplier's live site): `WF` is a countertop and `WL` is WALL HUNG. They are otherwise
 * near-identical, which is exactly why they must not share a size row — a rep tapping "48 in"
 * must not silently move the customer from a countertop to a wall-hung unit, because that is
 * a different installation entirely.
 *
 * The `D` marks a double, but sink is read from the product's attributes rather than this
 * letter — same rule as everywhere else. Colour is not an axis here at all (every unit is
 * White Resin); the WL line's real second axis is `light`, which is native.
 */
const CVF_SKU = /^CVF(\d{1,3})(D?)W([FL])$/;

/** ParsedSku.sink is a LABELLING field (single/double/none); "base" has no label to add. */
const baseToNull = (s: "single" | "double" | "base" | null): "single" | "double" | null =>
  s === "base" ? null : s;

// Drawer base cabinets (CVD): the segment after the size is NOT a color — it encodes
// DRAWER COUNT + orientation on a constant "BROWN" finish (verified w/ Steven 2026-07-31):
//   BROWN = 2-drawer · 1BROWN = 1-drawer · 3BROWN = 3-drawer · L/R = left/right orientation.
// Drawer count is fixed per size (12"/15"=1-drawer, 24"+=2-drawer), so it rides IN the
// size-row label rather than being its own (always-empty) axis. Orientation-suffixed units
// (…L…/…R…) are kit-only "Cabinet Only LR" components — not ready-to-use, so excluded like
// the "+" kit SKUs, per the CEO's ready-to-use-only directive.
const DRAWER_CABINET_MODELS = new Set(["CVD"]);

/* ------------------------------------------------------------------
 * SELECTION POLICY — which products render nav + in-place button rows together.
 *
 * Keyed by MODEL, deliberately, NOT by the full family key. Families can carry a
 * subtype segment (`CVI-TC` wall cabinet, `CVI-LC` linen cabinet), and a subtype family
 * has the same axis shape as its model. Keying on the family silently excluded them:
 * `CVI-TC`/`CVI-LC` each have TWO colour siblings, so they DO get a cross-link Colour
 * axis, but `MIXED_SELECTOR_MODELS.has("CVI-TC")` was false → their selector was dropped
 * and their 3 handle finishes were reachable only from the raw variant matrix.
 * Found 2026-08-05 by running the real selection logic over all 217 products
 * (`tests/selection-census.mjs`) — exactly 4 products were affected. CVL-LC/TC are
 * single-member families, which is why they never showed the symptom.
 * ------------------------------------------------------------------ */

/** Models whose cross-link axes and native axes render TOGETHER (nav + in-place). */
// CVB/CVC added 2026-08-07: the split modular lines NEED mixed mode. The configurator
// supplies the cross-product SIZE row (each size is its own product now) while the native
// selector keeps the 7 colours that live inside each product. Without mixed mode the
// configurator would render alone and reps would lose the colour picker entirely.
export const MIXED_SELECTOR_MODELS = new Set(["CVD", "CVK", "CVE", "CVG", "CVL", "CVI", "CVH", "CVB", "CVC", "CVF"]);

/**
 * Models where the NATIVE variant axis is authoritative over a same-named cross-link axis.
 * Default is the reverse (cross-link wins, duplicate native axis dropped). CVH needs the
 * inverse for `size`: `CVH54D-VG` carries native sizes 54/60/72 AND a cross-link size axis
 * pointing at the 30–60in singles (Steven, 2026-08-03 — native wins, which also makes all
 * four CVH54D pages consistent; tradeoff is the double→singles link goes away).
 */
export const NATIVE_WINS_AXES: Record<string, string[]> = { CVH: ["size"] };

/** Model prefix of a family key — `"CVI-TC"` → `"CVI"`, `"CVH"` → `"CVH"`. */
export function modelOfFamily(family: string): string {
  return String(family ?? "").split("-")[0];
}

/* ------------------------------------------------------------------
 * DATA FRESHNESS — how old is the stock information a rep is looking at?
 *
 * Stock is the fastest-moving field Artisan Bath Co. gives us: prices come off an annual dealer
 * sheet, but availability changes daily. Proven 2026-08-05 — `B531-BN` read as available in
 * our DB while the supplier had marked all 7 variants sold out at 07:33 that morning, ~18h after our
 * sync. The sold-out GUARDRAILS are already right (greyed options, disabled Add-to-Estimate),
 * so the residual risk is purely that a rep can't tell how fresh the answer is. Showing the
 * date turns a silent wrongness into a judgement the rep can make.
 *
 * The timestamp is `snapshot.version` = max(product.updatedAt) = when the sync last wrote —
 * and it TRAVELS INSIDE the snapshot, so an offline device reports the age of the data it
 * actually holds rather than the age of the server's data. That is the whole point.
 * ------------------------------------------------------------------ */

/** Stock older than this reads as stale enough to double-check before quoting. */
export const STOCK_STALE_AFTER_DAYS = 2;

/** Accepts an ISO string (server) or epoch-ms-as-string (`snapshot.version`). */
export function parseDataTimestamp(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const ok = (n: number) => (Number.isFinite(n) && n > 0 ? n : null);
  if (typeof v === "number") return ok(v);
  const s = String(v).trim();
  if (!s) return null;
  // `version` is String(epochMs). An INTEGER string must NOT go through Date.parse, which
  // reads "1754322000000" as a YEAR — the line would then always look fresh, defeating the
  // whole feature. The sign is matched too: `Date.parse("-5")` returns a real-looking
  // timestamp, so leaving it to the date path silently invents a date (caught by tests).
  if (/^-?\d+$/.test(s)) return ok(Number(s));
  return ok(Date.parse(s));
}

/** Absolute, locale-stable date — deterministic, so it is safe to render on the SERVER. */
export function formatStockAsOfDate(v: string | number | null | undefined): string | null {
  const ms = parseDataTimestamp(v);
  if (ms == null) return null;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Relative age. Depends on "now", so it is computed CLIENT-SIDE ONLY (after mount) —
 * rendering it on the server would risk a hydration mismatch every time a day boundary
 * fell between the server render and the client's clock.
 */
export function formatStockAge(
  v: string | number | null | undefined,
  now: number = Date.now()
): { days: number; phrase: string; stale: boolean } | null {
  const ms = parseDataTimestamp(v);
  if (ms == null) return null;
  // CALENDAR days, not elapsed 24h periods. A sync at 13:32 yesterday is ~19h old, which
  // floors to 0 — so an elapsed-time count rendered "as of Aug 4 · today" on Aug 5, which
  // contradicts the date printed right next to it. Reps read calendar days; match that.
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000));
  const phrase = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return { days, phrase, stale: days >= STOCK_STALE_AFTER_DAYS };
}

/**
 * THE eligibility decision — does this product render cross-link AND in-place rows together?
 * Exported (rather than inlined in ProductView) so the component and the coverage test share
 * ONE expression: a test that only checked the constants would still pass if the call site
 * regressed to family-keyed lookup, which is exactly the bug this replaced.
 */
export function isMixedEligible(family: string | null | undefined, hasNativeAxes: boolean): boolean {
  if (!family || !hasNativeAxes) return false;
  return MIXED_SELECTOR_MODELS.has(modelOfFamily(family));
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

interface ParsedSku {
  model: string;
  family: string;
  size: number | null;
  sink: "single" | "double" | null;
  color: string | null;
  top: string | null;
  handle: string | null;
  drawers: number | null; // CVD drawer cabinets: drawer count (rides in the size label)
}

/**
 * Parse a Artisan Bath Co. SKU into its family + axis values. Returns null if unparseable.
 *
 * `title` is optional and used ONLY by the modular CVB/CVC lines, whose SKUs do not carry a
 * trustworthy size (see MODULAR_LINE_MODELS). Every other family ignores it, so existing
 * single-argument callers are unaffected. Omitting it for a modular SKU yields null — i.e.
 * no configurator, which is the behaviour those products have today.
 */
export function parseSku(raw: string | null | undefined, ctx?: SkuContext): ParsedSku | null {
  if (!raw) return null;
  if (raw.includes("+")) return null; // composite kit SKUs (e.g. CVD12-3B+36-2LB) aren't configurable
  const segs = raw.trim().toUpperCase().split(/[-_ ]/).filter(Boolean);
  if (!segs.length) return null;
  const title = ctxTitle(ctx);

  // CVF resin tops — checked FIRST because `CVF60DWF` does not match the vanity pattern
  // below (it ends in letters), so without this it falls through to the cabinet branch and
  // yields family "CVF60DWF": a family of one, hence no size row at all.
  const cvf = CVF_SKU.exec(segs[0] ?? "");
  if (cvf && segs.length === 1) {
    const [, sizeStr, , mount] = cvf;
    const titleSize = sizeFromTitle(title);
    if (titleSize == null) return null; // the retired multi-size parents — no size row for them
    if (titleSize !== Number(sizeStr)) return null; // cross-check; refuse rather than guess
    return {
      model: "CVF",
      family: `CVF-W${mount}`, // WF countertop vs WL wall-hung: separate lines, deliberately
      size: titleSize,
      // `base` (the sink-less 11" filler top) maps to null: ParsedSku.sink exists to label
      // the size button ("+ Double Sink") and to key it, and "no sink" needs no label. The
      // real base/single/double answer for PRICING lives in PER_SIZE_BOWL, not here.
      sink: baseToNull(sinkFromContext(ctx)),
      color: null, // every unit is White Resin — colour is not a choice on this line
      top: null,
      handle: null,
      drawers: null,
    };
  }
  const s0 = segs[0];

  // Vanity-like: MODEL + SIZE + optional D/S (D=double, S/absent=single).
  const m = s0.match(/^([A-Z]+?)(\d+(?:\.\d+)?)([DS]?)$/);
  if (m) {
    const [, model, sizeStr, sinkLetter] = m;

    // Modular CVB/CVC lines: segment 0 is MODEL+MODULE WIDTH, segment 1 is SIZE+COLOUR.
    if (MODULAR_LINE_MODELS.has(model)) {
      const seg1 = segs[1] ?? "";
      const mm = seg1.match(/^(\d*)([A-Z]+)$/); // leading size digits (may be absent) + colour
      if (!mm) return null; // unexpected coding — don't guess axes
      const [, digits, colorCode] = mm;
      const moduleWidth = parseFloat(sizeStr);

      // Title is the source of truth for size. No title -> no configurator (today's state).
      // NOTE, verified by mutation testing: this line is DELIBERATELY REDUNDANT. The
      // cross-check below already rejects a null title (skuSize !== null is always true), so
      // deleting this changes no behaviour and breaks no test. It stays because it states the
      // intent — title is required — independently of how the cross-check happens to be
      // written today. Don't mistake it for load-bearing, and don't delete it as dead code.
      const titleSize = sizeFromTitle(title);
      if (titleSize == null) return null;

      // CROSS-CHECK, not a fallback: when the SKU spells the size out, it must agree. A
      // disagreement means one of our two assumptions about this line is wrong, and the
      // right response is to refuse rather than pick a winner and render it confidently.
      const skuSize = digits ? parseFloat(digits) : moduleWidth;
      if (skuSize !== titleSize) return null;

      return {
        model,
        // MODEL-MODULE — keeps CVB24 / CVB30 / CVB36 three separate families. Collapsing
        // them to "CVB" is the failure this whole branch exists to prevent.
        // HYPHENATED deliberately: modelOfFamily() splits on "-", so "CVB-36" yields "CVB"
        // (the convention already used by CVI-LC / CVI-TC). Without the hyphen it would
        // return "CVB36", which matches no entry in MIXED_SELECTOR_MODELS and would silently
        // drop these products out of mixed mode — i.e. no native colour picker.
        family: `${model}-${moduleWidth}`,
        size: titleSize,
        // These SKUs carry no D/S marker. Bowl count is decided by PER_SIZE_BOWL /
        // BOWL_OVERRIDES, not by the SKU, so leaving it null keeps the size row honest
        // instead of labelling buttons "+ Double Sink" from a guess.
        sink: null,
        // ⚠ NULL, AND THIS IS THE SUBTLE ONE. Every one of these per-size products offers
        // ALL SEVEN colours as native variants; the colour code in the product-level SKU is
        // merely whichever variant Artisan Bath Co. happened to list first, and it is NOT a choice
        // that distinguishes siblings. Treating it as a cross-product axis is actively
        // harmful: the configurator drops any size button that would change more than one
        // axis, so 42"(Blue) -> 84"(Vintage Green) reads as a two-axis move and the button
        // disappears. Measured before this was fixed: CVB30 offered 4 of its 6 sizes and two
        // products fell out of the family entirely. Colour stays where it belongs — the
        // native variant selector, via mixed mode.
        color: null,
        top: null,
        handle: null,
        drawers: null,
      };
    }

    // CVD drawer base cabinets: 2nd segment = [drawers?][L|R?]BROWN, not a color.
    if (DRAWER_CABINET_MODELS.has(model)) {
      const dm = (segs[1] ?? "").match(/^(\d+)?([LR])?BROWN$/);
      if (!dm) return null; // unexpected CVD coding — don't guess axes
      const [, drawerStr, orient] = dm;
      if (orient) return null; // "Cabinet Only LR" kit component — not ready-to-use
      return {
        model,
        family: model,
        size: parseFloat(sizeStr),
        sink: "single", // CVD cabinets have no sink; single keeps the sink axis off
        color: "Brown",
        top: null,
        handle: null,
        drawers: drawerStr ? parseInt(drawerStr, 10) : 2, // no prefix = two-drawer
      };
    }

    // CVL per-size products (2026-08-10). `CVL{size}-[S|D]{colour}-{handle}`.
    //
    // ⚠ THE DISCRIMINATOR IS THE TITLE, and it has to be. `CVL20-DG-MB` (new, per-size) and
    // `CVL20-DG-BN` (the OLD multi-size parent, still published with 54 native variants) are
    // structurally identical SKUs — same segment count, same shape. Only the title tells them
    // apart: the new ones lead with a size (`20" Freestanding …`), the parents don't. the supplier is
    // migrating this line handle-by-handle — MB is split, BN and GB are not yet — so this
    // also means BN/GB keep TODAY's behaviour untouched and pick up the new treatment
    // automatically the day the supplier splits them. No second code change needed.
    //
    // ⚠ COLOUR IS NULL, and skipping this is how "Ddg"/"Sdg" reach a customer's screen. the supplier
    // glues a sink marker onto the colour code, but only on sizes sold both ways:
    //     CVL60-DDG-MB = Double + Driftwood Gray      CVL60-SDG-MB = Single + Driftwood Gray
    //     CVL60-DG-MB  = Double + GRAY (not Driftwood!)  CVL60-SG-MB = Single + Gray
    // Each of these products carries all six colours as NATIVE variants anyway, so colour is
    // not a cross-product axis here at all — which makes decoding that prefix unnecessary
    // rather than merely hard. Sink comes from the attributes; see sinkFromContext.
    if (model === "CVL" && segs.length === 3 && !sinkLetter) {
      const titleSize = sizeFromTitle(title);
      if (titleSize != null) {
        if (titleSize !== parseFloat(sizeStr)) return null; // cross-check, refuse on conflict
        return {
          model,
          // Keyed by HANDLE so the split MB units form one ladder. Hyphenated so
          // modelOfFamily() still yields "CVL" (the CVI-TC convention). Interim by design:
          // cross-handle navigation is unavailable while the line is half-migrated, and this
          // is worth revisiting once BN/GB split too.
          family: `CVL-${segs[2]}`,
          size: titleSize,
          sink: baseToNull(sinkFromContext(ctx)),
          color: null,
          top: null,
          handle: HANDLE_LABELS[segs[2]] ?? null,
          drawers: null,
        };
      }
    }

    let top: string | null = null;
    let handle: string | null = null;
    for (const seg of segs.slice(2)) {
      if (TOP_LABELS[seg]) top = TOP_LABELS[seg];
      else if (HANDLE_LABELS[seg]) handle = HANDLE_LABELS[seg];
    }
    return {
      model,
      family: model, // fold single/double into one family (they cross-link on the supplier)
      size: parseFloat(sizeStr),
      sink: sinkLetter === "D" ? "double" : "single",
      color: segs[1] ? (COLOR_LABELS[segs[1]] ?? titleCase(segs[1])) : null,
      top,
      handle,
      drawers: null,
    };
  }

  // Cabinet-like (CVI/CVL): MODEL-SUBTYPE-COLOR-HANDLE, no size axis.
  const subtype = segs[1] ?? "";
  if (subtype === "HANDLE") return null; // handle accessory (CVL-HANDLE-BN…), not a cabinet family
  let handle: string | null = null;
  for (const seg of segs.slice(3)) if (HANDLE_LABELS[seg]) handle = HANDLE_LABELS[seg];
  return {
    model: s0,
    family: subtype ? `${s0}-${subtype}` : s0,
    size: null,
    sink: null,
    color: segs[2] ? (COLOR_LABELS[segs[2]] ?? titleCase(segs[2])) : null,
    top: null,
    handle,
    drawers: null,
  };
}

export interface ConfigOption {
  label: string;
  targetSlug: string;
  selected: boolean;
  soldOut: boolean;
  swatch?: string | null; // color axis: the target product's primary image
}
export interface ConfigAxis {
  key: "size" | "color" | "top" | "handle";
  label: string;
  options: ConfigOption[];
}
export interface Configurator {
  family: string;
  axes: ConfigAxis[];
}

const skuOf = (p: Product): string | null => p.sourceSku ?? p.variants?.[0]?.sourceSku ?? null;
const isSoldOut = (p: Product) => p.variants.length > 0 && p.variants.every((v) => v.available === false);
const sizeKey = (s: ParsedSku) => (s.size == null ? null : `${s.size}${s.sink === "double" ? "D" : ""}`);
const sizeLabel = (s: ParsedSku) =>
  `${s.size} in${s.drawers ? ` (${s.drawers}-Drawer)` : ""}${s.sink === "double" ? " + Double Sink" : ""}`;

/**
 * Build the configurator for a product: its family's option axes, each value linking
 * to the sibling product that carries it. Returns null when the product has no family
 * siblings (standalone items, and native-variant products, get no rows). Pure.
 */
export function buildConfigurator(product: Product, all: Product[]): Configurator | null {
  // Titles are passed through because the modular CVB/CVC lines take their size from there
  // rather than from the SKU (see MODULAR_LINE_MODELS). Every other family ignores it.
  const cur = parseSku(skuOf(product), product);
  if (!cur || !CONFIGURATOR_MODELS.has(cur.model)) return null;

  const members = all
    .map((p) => ({ p, s: parseSku(skuOf(p), p) }))
    .filter((m): m is { p: Product; s: ParsedSku } => !!m.s && m.s.family === cur.family);
  if (members.length < 2) return null;

  // Target for an axis change = a member with the new value that ALSO matches the
  // current product on all OTHER axes (i.e. changing ONLY this one axis). the supplier's SKU
  // space is sparse — many combinations simply don't exist (e.g. black-limestone tops
  // only ship on doubles, engineered-marble only on singles). When no sibling differs
  // in this axis alone, the value is NOT reachable from here, so we return null and the
  // caller drops that button — rather than silently navigating to an unrelated variant
  // (the "click Engineered Marble, jump to a different size" bug).
  const resolveExact = (
    valueOf: (s: ParsedSku) => string | null,
    others: Array<(s: ParsedSku) => string | null>,
    value: string,
  ): Product | null => {
    const cand = members.filter((m) => valueOf(m.s) === value);
    const exact = cand.find((m) => others.every((f) => f(m.s) === f(cur)));
    return exact ? exact.p : null;
  };

  const buildAxis = (
    key: ConfigAxis["key"],
    label: string,
    valueOf: (s: ParsedSku) => string | null,
    labelOf: (s: ParsedSku) => string,
    others: Array<(s: ParsedSku) => string | null>,
    withSwatch = false,
  ): ConfigAxis | null => {
    const seen = new Map<string, ParsedSku>();
    for (const m of members) {
      const v = valueOf(m.s);
      if (v != null && !seen.has(v)) seen.set(v, m.s);
    }
    const curVal = valueOf(cur);
    const options: ConfigOption[] = [];
    for (const [v, s] of seen) {
      const selected = v === curVal;
      // The selected value always renders (it points at the current page). Any OTHER
      // value renders only if it's reachable by changing this axis alone.
      const target = selected ? product : resolveExact(valueOf, others, v);
      if (!target) continue;
      options.push({
        label: labelOf(s),
        targetSlug: target.slug,
        selected,
        soldOut: isSoldOut(target),
        swatch: withSwatch ? (target.images.primary ?? null) : undefined,
      });
    }
    // A real choice needs the selected value plus at least one reachable alternative.
    if (options.length < 2) return null;
    return { key, label, options };
  };

  const byColor = (s: ParsedSku) => s.color;
  const byTop = (s: ParsedSku) => s.top;
  const byHandle = (s: ParsedSku) => s.handle;

  const axes: ConfigAxis[] = [];
  const size = buildAxis("size", "Size", sizeKey, sizeLabel, [byColor, byTop, byHandle]);
  if (size) {
    size.options.sort((a, b) => (parseFloat(a.label) || 0) - (parseFloat(b.label) || 0));
    axes.push(size);
  }
  const color = buildAxis("color", "Color", byColor, (s) => s.color ?? "", [sizeKey, byTop, byHandle], true);
  if (color) axes.push(color);
  const top = buildAxis("top", "Top", byTop, (s) => s.top ?? "", [sizeKey, byColor, byHandle]);
  if (top) axes.push(top);
  const handle = buildAxis("handle", "Handle", byHandle, (s) => s.handle ?? "", [sizeKey, byColor, byTop]);
  if (handle) axes.push(handle);

  return axes.length ? { family: cur.family, axes } : null;
}

/* ------------------------------------------------------------------ *
 * Browse-tile grouping — collapse a split size-ladder into ONE tile
 *
 * When Artisan Bath Co. splits a line into one product per size, the browse grid shows N tiles for what
 * is conceptually one product. This collapses those into a single tile with a "N sizes" badge —
 * decided by the SAME reachability engine (`buildConfigurator`) the product page uses, never by the
 * SKU family key alone (the mistake that got the first attempt reverted).
 *
 * We collapse by NAVIGABLE COMPONENT: within a family, treat two products as linked when the
 * product page can move from one to the other in a single click (any axis of `buildConfigurator`).
 * A connected component is then a set mutually reachable by navigating the page, and we collapse
 * each component that offers ≥2 sizes into one tile, choosing the cheapest size-bearing member as
 * the representative (so its own Size selector — hence the badge — reaches everything the tile
 * claims). This handles each case correctly:
 *   • clean size ladders (CVL/CVB/CVC/…) — the whole family is one component → one tile;
 *   • multi-axis families (CVG, countertop welded to size) — split into the groups you can actually
 *     move within (e.g. one per countertop), each fully navigable → several honest tiles, no member
 *     stranded (unreachable from its tile);
 *   • colour-only components (one size, several finishes) — no size axis, so left as individual
 *     tiles (their colour thumbnails stay visible);
 *   • non-configurator models (CVM/CVN/mirrors/tubs) — `buildConfigurator` returns null → untouched.
 * Pure + isomorphic: identical result online (getAllProducts) and offline (snapshot), so a rep sees
 * the same grid with no signal.
 * ------------------------------------------------------------------ */
export interface BrowseGroup {
  family: string;
  representativeSlug: string; // the tile shown (cheapest member → truthful "Starting at")
  memberSlugs: string[]; // the visible members it stands in for (representative included)
  sizeCount: number; // size-axis options on the representative's page == the badge number
}

const isHiddenByDefaultProduct = (p: Product): boolean => {
  const v = p.attributes?.["hide_by_default"];
  return v === true || v === "true";
};

/** The size-ladder components that collapse to one browse tile. See the block comment. */
export function computeBrowseGroups(all: Product[]): BrowseGroup[] {
  // Bucket configurator-eligible, browse-visible products by family key. Base cabinets and add-ons
  // (hide_by_default) never collapse — they are their own tiles behind the toggle. Configurator
  // links only ever exist within a family, so navigable components live inside these buckets.
  const families = new Map<string, Product[]>();
  for (const p of all) {
    if (isHiddenByDefaultProduct(p)) continue;
    const s = parseSku(skuOf(p), p);
    if (!s || !CONFIGURATOR_MODELS.has(s.model)) continue;
    const bucket = families.get(s.family);
    if (bucket) bucket.push(p);
    else families.set(s.family, [p]);
  }

  const groups: BrowseGroup[] = [];
  for (const [family, members] of families) {
    if (members.length < 2) continue;

    // Cache each member's configurator once; the union of ALL its axis targets = the siblings the
    // product page can reach in one click. Build the undirected reachability graph over VISIBLE
    // members only (a target to a hidden product is not a browse tile).
    const cfgOf = new Map<Product, Configurator | null>();
    const idx = new Map(members.map((p, i) => [p.slug, i]));
    const adj: number[][] = members.map(() => []);
    members.forEach((p, i) => {
      const cfg = buildConfigurator(p, all);
      cfgOf.set(p, cfg);
      for (const ax of cfg?.axes ?? []) {
        for (const opt of ax.options) {
          const j = idx.get(opt.targetSlug);
          if (j != null && j !== i) {
            adj[i].push(j);
            adj[j].push(i);
          }
        }
      }
    });

    // Connected components = products mutually reachable by navigating the product page. A clean
    // size ladder is one component; a multi-axis family (CVG, where the countertop is welded to the
    // size) splits into the groups you can actually move within — each fully navigable, so
    // collapsing one can NEVER strand a member.
    const seen = new Array(members.length).fill(false);
    for (let start = 0; start < members.length; start++) {
      if (seen[start]) continue;
      const comp: number[] = [];
      const stack = [start];
      seen[start] = true;
      while (stack.length) {
        const u = stack.pop()!;
        comp.push(u);
        for (const v of adj[u]) if (!seen[v]) { seen[v] = true; stack.push(v); }
      }
      if (comp.length < 2) continue;

      // The tile is a member that actually exposes a SIZE selector (≥2 sizes reachable by changing
      // size alone). If none does, the component varies only by colour/finish — not a size ladder —
      // so leave those as individual tiles (their colour thumbnails stay visible in the grid). The
      // badge is that representative's own size count, so it always equals what its page navigates.
      const sized = comp.map((i) => members[i]).filter((p) => cfgOf.get(p)?.axes.some((a) => a.key === "size"));
      if (!sized.length) continue;
      const rep = sized.reduce((a, b) => ((itemPrice(a) ?? Infinity) <= (itemPrice(b) ?? Infinity) ? a : b));
      const sizeCount = cfgOf.get(rep)!.axes.find((a) => a.key === "size")!.options.length;
      groups.push({
        family,
        representativeSlug: rep.slug,
        memberSlugs: comp.map((i) => members[i].slug),
        sizeCount,
      });
    }
  }
  return groups;
}

/** Merge the filter attributes of the collapsed members so filtering by ANY member's
 *  colour/finish/sink still surfaces the one representative tile. Enum values dedupe to a
 *  single value or an array; the client's `valuesOf` already reads either. */
function unionItemAttributes(items: CatalogItem[]): Record<string, ItemAttributeValue> {
  const acc = new Map<string, Set<string>>();
  for (const it of items) {
    for (const [k, v] of Object.entries(it.attributes ?? {})) {
      if (v == null) continue;
      const set = acc.get(k) ?? acc.set(k, new Set()).get(k)!;
      for (const one of Array.isArray(v) ? v : [v]) set.add(String(one));
    }
  }
  const out: Record<string, ItemAttributeValue> = {};
  for (const [k, set] of acc) out[k] = set.size === 1 ? [...set][0] : [...set];
  return out;
}

/**
 * Apply the groups to one category's items: each group's representative becomes a single tile
 * carrying the size count, the UNION of its members' filter attributes, and the lowest member
 * price; the other members drop out. Ungrouped items pass through untouched. Pure; called with
 * the SAME groups online and offline so the grids match. Members not present in `items` (e.g.
 * a different category — shouldn't happen for a same-category family) are simply skipped.
 */
export function applyBrowseGroups(items: CatalogItem[], groups: BrowseGroup[]): CatalogItem[] {
  if (!groups.length) return items;
  const repOf = new Map<string, BrowseGroup>();
  const drop = new Set<string>();
  for (const g of groups) {
    repOf.set(g.representativeSlug, g);
    for (const slug of g.memberSlugs) if (slug !== g.representativeSlug) drop.add(slug);
  }
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const out: CatalogItem[] = [];
  for (const item of items) {
    if (drop.has(item.slug)) continue; // a collapsed non-representative member
    const g = repOf.get(item.slug);
    if (!g) {
      out.push(item);
      continue;
    }
    const members = g.memberSlugs.map((s) => bySlug.get(s)).filter((x): x is CatalogItem => !!x);
    const minPrice = members.reduce<number | null>(
      (m, x) => (x.price != null && (m == null || x.price < m) ? x.price : m),
      item.price,
    );
    const unionAttrs = unionItemAttributes(members);
    // The tile shows only the cheapest size's title, but it NAVIGATES to every member size.
    // Sizes live in each member's TITLE ("96\" Bathroom Vanity …"), not an attribute, so fold
    // every member's title + SKU into the tile's search haystack — otherwise searching "96"
    // (the reported bug) misses a 96" size collapsed behind a 24" representative tile.
    const searchText = normalizeSearchText(
      [...members.map((m) => `${m.title} ${m.sku ?? ""}`), ...(item.tags ?? []), ...attrValues(unionAttrs)].join(" "),
    );
    // A collapsed tile is "sold out" ONLY if every size is — a line with any available size stays
    // orderable, so we never hide real availability behind the badge.
    const soldOut = members.length > 0 && members.every((m) => m.soldOut);
    out.push({ ...item, price: minPrice, attributes: unionAttrs, groupCount: g.sizeCount, searchText, soldOut });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Native-variant selector (Configurator-first, Slice 1)
 * For products whose options are REAL Shopify variants on ONE product
 * (size × color × …, e.g. VA3D-60 mirrors, CVA vanities) — as opposed to
 * the cross-linked separate-product families handled by buildConfigurator.
 * Derives the same button-row axis model from `product.variants`, but each
 * option selects a variant IN PLACE (no navigation): the client resolves the
 * current selection to a variant → price (Slice 1b wires image/estimate).
 * Pure + isomorphic, so it works online and offline from the snapshot.
 * ------------------------------------------------------------------ */
export interface SelectorValue {
  value: string; // canonical option value, e.g. "60 inch"
  label: string; // display label (same as value today)
  available: boolean; // ≥1 variant carrying this value is in stock
}
export interface SelectorAxis {
  key: string; // optionValues key: "size" | "color" | "handle_finish" | …
  label: string; // human label (from attribute defs)
  values: SelectorValue[];
}
export interface SelectorVariant {
  optionValues: Record<string, string>;
  sku: string | null;
  price: number | null;
  available: boolean;
  /** This variant's photo (Slice 1c); null → the gallery keeps the product hero. */
  image: string | null;
}
export interface VariantSelector {
  axes: SelectorAxis[];
  variants: SelectorVariant[];
}

/**
 * Build the in-place variant selector for a native-variant product. Returns null
 * when there's nothing to choose (≤1 priced variant or no multi-value axis) — the
 * price box already covers the single-price case. `labels` maps an option key to its
 * display label (from the product's AttributeDefinitions).
 */
export function buildVariantSelector(
  product: Product,
  labels: Record<string, string> = {},
): VariantSelector | null {
  const override = product.pricing?.manualOverride ?? null;
  const priceBySku = new Map((product.pricing?.perVariant ?? []).map((v) => [v.sku, v.customerPrice]));
  const priceOf = (sku: string | null) =>
    override != null ? override : (sku != null ? priceBySku.get(sku) ?? null : null);

  const variants: SelectorVariant[] = (product.variants ?? [])
    .map((v) => ({
      optionValues: v.optionValues ?? {},
      sku: v.sourceSku,
      price: priceOf(v.sourceSku),
      available: v.available !== false,
      image: v.image ?? null,
    }))
    .filter((v) => v.price != null); // only buyable variants participate
  if (variants.length < 2) return null;

  const titleize = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const keys = [...new Set(variants.flatMap((v) => Object.keys(v.optionValues)))];
  const axes: SelectorAxis[] = [];
  for (const key of keys) {
    const values = [...new Set(variants.map((v) => v.optionValues[key]).filter(Boolean))];
    if (values.length < 2) continue; // not a real choice
    axes.push({
      key,
      label: labels[key] || titleize(key),
      values: values.map((value) => ({
        value,
        label: value,
        available: variants.some((v) => v.optionValues[key] === value && v.available),
      })),
    });
  }
  if (!axes.length) return null;
  return { axes, variants };
}

/** Exact variant matching a full axis selection (all selected keys equal). Null if none. */
export function resolveVariant(
  variants: SelectorVariant[],
  selection: Record<string, string>,
): SelectorVariant | null {
  return (
    variants.find((v) => Object.entries(selection).every(([k, val]) => v.optionValues[k] === val)) ?? null
  );
}

/** Initial selection = the first in-stock variant (or the first variant if all sold out). */
export function initialSelection(sel: VariantSelector): Record<string, string> {
  const first = sel.variants.find((v) => v.available) ?? sel.variants[0];
  const selection: Record<string, string> = {};
  for (const ax of sel.axes) {
    const v = first.optionValues[ax.key];
    if (v != null) selection[ax.key] = v;
  }
  return selection;
}

/**
 * Resolve a click on one axis when the SKU space is sparse (not every combination
 * exists). Sets `key`→`value`, keeps the other current axis values where a variant
 * supports them, and prefers an in-stock result — so changing "size" never lands on a
 * non-existent combo. Returns the new full selection + the variant it resolves to.
 */
export function selectAxisValue(
  sel: VariantSelector,
  current: Record<string, string>,
  key: string,
  value: string,
): { selection: Record<string, string>; variant: SelectorVariant | null } {
  const cand = sel.variants.filter((v) => v.optionValues[key] === value);
  const otherKeys = sel.axes.map((a) => a.key).filter((k) => k !== key);
  const score = (v: SelectorVariant) =>
    otherKeys.reduce((n, k) => n + (v.optionValues[k] === current[k] ? 1 : 0), 0) +
    (v.available ? 0.5 : 0); // tie-break toward in-stock
  const best = cand.slice().sort((a, b) => score(b) - score(a))[0] ?? null;
  const selection: Record<string, string> = {};
  if (best) for (const ax of sel.axes) if (best.optionValues[ax.key] != null) selection[ax.key] = best.optionValues[ax.key];
  return { selection, variant: best };
}

/* ------------------------------------------------------------------
 * Gallery ordering (2026-08-05). Artisan Bath Co.'s product galleries mix photos of
 * DIFFERENT variants of the same model: 270 of 1,246 images (22%, across 62 of 217
 * products) depict a variant other than the page's default. Slice 1c already leads
 * with the selected variant's own photo, but the remaining thumbnails stay in the supplier's
 * arbitrary order, so a rep who picks "Integrated Overflow" still sees that variant's
 * OTHER five photos scattered below unrelated ones.
 *
 * We ORDER, never FILTER. Filtering to "only images matching the shown variant" was
 * measured and rejected: it would leave 50 products with ZERO gallery images and
 * reduce 40 more to a single image, because ~28% of gallery images are generically
 * named (36.jpg, DG.jpg, 8_18281ccd….jpg) and match no SKU at all. Those are real
 * lifestyle/detail/dimension shots. Ordering surfaces the relevant photos while
 * losing nothing.
 * ---------------------------------------------------------------- */

/** Filename → comparable key: strip the path, query, extension and punctuation. */
function imageFileKey(url: string): string {
  const file = decodeURIComponent(String(url).split("/").pop() ?? "").split("?")[0];
  return file.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/**
 * Order a product's gallery for the currently-selected variant:
 *   1. the variant's own photo (the hero),
 *   2. every other photo whose filename is named after that variant's SKU,
 *   3. everything else, in Artisan Bath Co.'s original order.
 * Deduped, and NOTHING is dropped — the output is always a permutation of the input
 * (plus `variantImage` if the supplier supplied one that isn't in the gallery). With no variant
 * selected, or no SKU to match on, this degrades to the previous behaviour.
 */
export function orderGalleryForVariant(
  images: string[],
  variantImage: string | null,
  variantSku: string | null,
): string[] {
  const rest = images.filter((u) => u !== variantImage);
  const key = variantSku ? variantSku.replace(/[^a-z0-9]/gi, "").toUpperCase() : "";
  // A 1-2 char key would match almost anything; require something substantive.
  const sameVariant = key.length >= 3 ? rest.filter((u) => imageFileKey(u).startsWith(key)) : [];
  const others = rest.filter((u) => !sameVariant.includes(u));
  return [...new Set([...(variantImage ? [variantImage] : []), ...sameVariant, ...others])];
}
