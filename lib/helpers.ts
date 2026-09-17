/**
 * helpers.ts — PURE utilities and lightweight types shared by server and client.
 *
 * IMPORTANT: this module must never import the catalog JSON. The client filter
 * component imports from here; importing lib/catalog (which loads the full
 * dataset) into a client component would bundle every product into the browser.
 * Type-only imports are fine (erased at build) — that's how the isomorphic
 * snapshot type below references the Product shape.
 */

import type { Product } from "@/schema/types";

export function slugify(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function formatUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Attribute value as it appears on a catalog item (single value or available set). */
export type ItemAttributeValue = string | number | boolean | Array<string | number>;

/** Slim, serializable product shape sent to the client for browsing/filtering. */
export interface CatalogItem {
  slug: string;
  title: string;
  category: string;
  sku: string | null;
  image: string | null;
  tags: string[];
  price: number | null; // display price (manual override or starting-at)
  priceLow: number | null;
  priceHigh: number | null;
  attributes: Record<string, ItemAttributeValue>;
  /** When set, this tile REPRESENTS a collapsed size-ladder family (see computeBrowseGroups):
   *  the count of sizes its product page's Size selector navigates to. Absent on normal tiles. */
  groupCount?: number;
  /** Precomputed, already-normalized free-text search haystack. Set ONLY on collapsed group
   *  tiles (applyBrowseGroups), where it carries EVERY member's title + SKU so the tile is
   *  findable by any size it offers — the size lives in each member's title, not an attribute,
   *  and the tile's own title shows only the cheapest size. Absent on normal tiles, where
   *  itemSearchText derives the haystack from the item's own fields. See itemSearchText. */
  searchText?: string;
  /** Every orderable variant is sold out at Artisan Bath Co. (no stock to sell). Drives the "Sold out"
   *  card badge. Computed from synced availability, so it clears itself when the supplier restocks. For a
   *  collapsed group tile it means EVERY size is sold out (a line with any available size is not
   *  flagged, so real availability is never hidden). See isAllSoldOut / applyBrowseGroups. */
  soldOut?: boolean;
}

/** A filter group the UI renders (one per filterable enum attribute). */
export interface FilterDef {
  key: string;
  label: string;
  options: string[];
  order: number;
}

/** Typed attribute definition (moved here so client code can use it too). */
export interface AttrDef {
  key: string;
  label: string;
  category: string;
  type: string;
  unit?: string | null;
  options: string[];
  variantDefining: boolean;
  filterable: boolean;
  order: number;
}

/** A category tile summary (name, slug, product count, sample image). */
export interface CategorySummary {
  name: string;
  slug: string;
  count: number;
  sample: string | null;
}

/**
 * The offline snapshot: everything needed to render the whole catalog client-side
 * with no network. Full product records (so product pages work offline too) plus
 * attribute definitions; listings/categories/filters/search are all DERIVED from
 * these via the isomorphic helpers in lib/catalog-shared.ts. `version` changes when
 * the underlying data changes, so the client can detect "update available".
 */
export interface CatalogSnapshot {
  version: string;
  generatedAt: string;
  partner: string;
  products: Product[];
  attributeDefinitions: AttrDef[];
}

/**
 * Which SKU the product page shows (2026-08-07, CEO: "why don't the SKUs show up differently
 * when you click the configured options?").
 *
 * Lives HERE rather than beside its component for the same reason lib/sync-anomalies.ts
 * exists apart from lib/sync.ts: the logic worth testing has to live where a test can reach
 * it. A .tsx file cannot be imported by the node test runner at all — JSX is not parseable
 * by type-stripping — so a rule written inside the component would be a rule nobody can pin.
 *
 * The fallback chain is not defensive padding. Artisan Bath Co.'s variant SKUs genuinely carry
 * "nulls + collisions" (which is why lib/sync.ts keys on the Shopify product id instead), and
 * at least one published product has no SKU at all. Empty string is treated as absent, and
 * the em dash preserves exactly what this line rendered before the change.
 *
 * Deliberately does NOT trim or reformat: these are order codes, and reformatting one is how
 * the wrong item ships. Same rule as the toilets' Item #/Model #.
 */
export function displaySku(
  selectedSku: string | null | undefined,
  productSku: string | null | undefined,
): string {
  return selectedSku || productSku || "—";
}
