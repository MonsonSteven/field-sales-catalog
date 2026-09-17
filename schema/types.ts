/**
 * types.ts — the canonical Summit catalog data model.
 *
 * Hand-authored source of truth shared by the ingestion pipeline (pipeline/*.mjs)
 * and the Next.js frontend. Payload generates its own types from the collection
 * configs in ../payload/collections; those must stay structurally compatible with
 * these. When they diverge, THIS file states the intent.
 *
 * Design principle: core fields are universal and partner-agnostic; everything
 * product-type-specific lives in `attributes`, whose SHAPE is described by
 * AttributeDefinition records owned by a Category. Adding a partner or category
 * is data entry, never a schema migration.
 */

export type AttributeType = "text" | "number" | "enum" | "boolean" | "dimension";

/** The typed "schema" for one attribute, owned by a Category. Stored as data. */
export interface AttributeDefinition {
  key: string;                 // canonical snake_case, e.g. "top_material"
  label: string;               // display, e.g. "Top Material"
  category: string;            // owning category name/slug
  type: AttributeType;
  unit?: string | null;        // e.g. "in", "mph", "gal"
  options: string[];           // allowed values when type === "enum"
  variantDefining: boolean;    // true if this axis distinguishes variants (size/color)
  filterable: boolean;         // eligible for faceted search (feature deferred)
  order: number;               // display order on spec sheets / filters
  distinctValues?: number;     // derived: how many distinct values were seen
}

/** A single attribute value on a product: either one value or the available set. */
export type AttributeValue = string | number | boolean | string[];

export interface Partner {
  name: string;                // "Artisan Bath Co."
  slug: string;
  sourceType: "shopify_json" | "csv" | "edi" | "manual";
  sourceBase?: string;         // e.g. "https://artisanbath.example"
  imageUsageApproved?: boolean;
}

export interface Category {
  name: string;                // "Vanities"
  slug: string;
  partner: string;             // owning partner name
  order?: number;
  // attribute definitions are related records (AttributeDefinition[]), not embedded
}

export interface ProductVariant {
  sourceSku: string | null;
  available: boolean;
  /** Source retail price — INTERNAL cost reference ONLY, never displayed. */
  sourcePrice: number | null;
  optionValues: Record<string, string>;
  /**
   * This variant's own photo, so the gallery can follow an in-place selection
   * (Slice 1c). Mirrored to Blob like the other images — a MIRRORED value must be
   * PRESERVED by `runSync` exactly as `primaryImage`/`gallery` are, or a re-sync
   * silently un-mirrors it (the 2026-07-29 postmortem). Null when the supplier has no
   * variant photo (~3% of variants) → the UI falls back to the product hero.
   */
  image?: string | null;
}

export interface VariantPrice {
  sku: string | null;
  /** Which source drove this variant's price. `dealer_inferred` = borrowed from a covered
   *  same-size sibling because the dealer sheet omits this SKU (2026-08-06). */
  basis: "dealer" | "retail" | "dealer_inferred";
  /** The value fed to the formula (dealer delivered price, or retail fallback). */
  itemPrice: number | null;
  /** Matched dealer "Delivered Price (USA)", or null when not on the sheet. Audit. */
  dealerPrice: number | null;
  /** The borrowed dealer price, when `basis` is `dealer_inferred`. Audit. */
  inferredDealerPrice?: number | null;
  /** Artisan Bath Co. retail — INTERNAL cost reference, kept for audit. Never displayed. */
  retailPrice: number | null;
  /** THIS VARIANT's bowl count (2026-08-06) — the audit trail on a mixed-bowl vanity,
   *  where the product-level value is "mixed" and only this is authoritative. */
  bowlCount?: "single" | "double" | "base" | null;
  /** Formula output (itemPrice × taxRate × multiplier). The number customers see. */
  customerPrice: number | null;
}

/**
 * Pricing per formula_v1 (illustrative demo formula):
 *   customer_price = ((item_price × taxRate) + item_price) × multiplier
 * Precomputed and stored on each product. `manualOverride` is the one hand-authored
 * field — it survives re-sync and, when set, wins over the formula.
 */
export interface Pricing {
  /** `vanity_v1` = the bowl-adder formula (Vanities). `mixed` = this product's variants do
   *  not share one model, e.g. a vanity-top line with a sink-less filler size. */
  model: "formula_v1" | "vanity_v1" | "mixed";
  /** Vanities: the bowl count driving the adder. `mixed` = it varies BY VARIANT, and only
   *  `perVariant[].bowlCount` is authoritative (2026-08-06). null on non-vanities. */
  bowlCount?: "single" | "double" | "base" | "mixed" | null;
  formula: { taxRate: number; multiplier: number; adder?: number; expression: string };
  /** Which source drove this product's prices, across its variants. */
  basis: "dealer" | "retail" | "mixed" | "none";
  perVariant: VariantPrice[];
  startingAt: number | null;              // lowest variant customerPrice (product-level display)
  priceRange: { low: number; high: number } | null;
  manualOverride: number | null;          // Summit-authored; survives sync; null = use formula
  _status?: "set" | "no_source_price";
}

export type ProductStatus = "draft" | "published" | "hidden" | "needs_review";

export interface Product {
  source: { platform: string; partner: string; id: number | string; handle: string };
  partner: string;
  category: string;
  title: string;
  slug: string;
  sourceSku: string | null;
  descriptionHtml: string;
  descriptionText: string;
  tags: string[];
  images: { primary: string | null; gallery: string[]; sourceCount: number };
  attributes: Record<string, AttributeValue>;
  variants: ProductVariant[];
  pricing: Pricing;
  status: ProductStatus;
}

/** The full artifact written by the ingestion pipeline. */
export interface NormalizedCatalog {
  generatedFromCount: number;
  partner: string;
  source: { platform: string; base: string };
  products: Product[];
}
