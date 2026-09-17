import "server-only";
import { cache } from "react";
import { getPayload } from "payload";
import config from "@payload-config";
import type { Product } from "@/schema/types";
import {
  slugify, formatUSD,
  type CatalogItem, type FilterDef, type AttrDef, type CategorySummary, type CatalogSnapshot,
} from "./helpers";
// Curated category sample SKUs — shared so server + client compute the same samples.
// shapeFilterDefs — one shared filter-shaper so server + offline rails can't drift.
import {
  PREFERRED_SAMPLE_SKU,
  shapeFilterDefs,
  itemSearchText,
  normalizeSearchText,
  isHiddenByDefault,
  isAllSoldOut,
  soldOutRank,
} from "./catalog-shared";

export { slugify, formatUSD };
// Re-exported so existing server imports (`from "@/lib/catalog"`) keep working now
// that these types live in the isomorphic helpers module.
export type { CatalogItem, FilterDef, AttrDef, CategorySummary, CatalogSnapshot };

async function db() {
  return getPayload({ config });
}

/* ---------- helpers to map Payload docs -> frontend shapes ---------- */

const relName = (rel: any): string => (rel && typeof rel === "object" ? rel.name : "");

function categoryOf(doc: any): string {
  return relName(doc.categoryOverride) || relName(doc.category) || "";
}

function stripHtml(html: string): string {
  return String(html ?? "")
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** display price = manual override (authored) wins over the formula's starting-at */
function priceOf(doc: any): number | null {
  return doc.priceManualOverride ?? doc.pricing?.startingAt ?? null;
}

/** Display price for a fully-mapped Product (override wins over the formula). */
export function displayPrice(p: Product): number | null {
  return p.pricing.manualOverride ?? p.pricing.startingAt ?? null;
}

function toItem(doc: any): CatalogItem {
  return {
    slug: doc.slug,
    title: doc.title,
    category: categoryOf(doc),
    sku: doc.sourceSku ?? null,
    image: doc.primaryImage ?? null,
    tags: doc.tags ?? [],
    price: priceOf(doc),
    priceLow: doc.pricing?.priceRange?.low ?? null,
    priceHigh: doc.pricing?.priceRange?.high ?? null,
    attributes: doc.attributes ?? {},
    soldOut: isAllSoldOut(doc.variants),
  };
}

function toProduct(doc: any): Product {
  return {
    source: { platform: "shopify", partner: relName(doc.partner) || "Artisan Bath Co.", id: doc.sourceId, handle: doc.sourceHandle },
    partner: relName(doc.partner) || "Artisan Bath Co.",
    category: categoryOf(doc),
    title: doc.title,
    slug: doc.slug,
    sourceSku: doc.sourceSku ?? null,
    descriptionHtml: doc.descriptionHtml ?? "",
    descriptionText: stripHtml(doc.descriptionHtml).slice(0, 600),
    tags: doc.tags ?? [],
    images: { primary: doc.primaryImage ?? null, gallery: doc.gallery ?? [], sourceCount: doc.sourceImageCount ?? 0 },
    attributes: doc.attributes ?? {},
    variants: doc.variants ?? [],
    // reconcile: the authored override lives on its own column, not in the pricing json
    pricing: { ...(doc.pricing ?? {}), manualOverride: doc.priceManualOverride ?? null },
    status: doc.status,
  };
}

/* ---------- cached per-request fetches ---------- */

/** Slim published products for listing/search (excludes heavy descriptionHtml). `variants` is
 *  selected for the availability check only (toItem derives `soldOut` from it — the card badge);
 *  variants are NOT sent to the client, just the resulting boolean. */
const listPublished = cache(async (): Promise<any[]> => {
  const payload = await db();
  const res = await payload.find({
    collection: "products",
    where: { status: { equals: "published" } },
    depth: 1,
    limit: 1000,
    pagination: false,
    select: {
      slug: true, title: true, category: true, categoryOverride: true,
      sourceSku: true, primaryImage: true, tags: true, attributes: true,
      variants: true, pricing: true, priceManualOverride: true,
    },
  });
  return res.docs;
});

/**
 * When the catalog data was last written by a sync = max(product.updatedAt).
 * This is the SAME value `getSnapshot()` reports as `version`, so the online page and an
 * offline device describe freshness identically (offline reads it from its own snapshot, so
 * it reports the age of the data that device actually holds). Cheap: one indexed row.
 */
export const getDataFreshness = cache(async (): Promise<string | null> => {
  const payload = await db();
  const res = await payload.find({
    collection: "products",
    where: { status: { equals: "published" } },
    sort: "-updatedAt",
    limit: 1,
    depth: 0,
  });
  return (res.docs[0] as any)?.updatedAt ?? null;
});

const allAttrDefs = cache(async (): Promise<AttrDef[]> => {
  const payload = await db();
  const res = await payload.find({ collection: "attributeDefinitions", depth: 1, limit: 1000, pagination: false });
  return res.docs.map((d: any) => ({
    key: d.key,
    label: d.label,
    category: relName(d.category),
    type: d.type,
    unit: d.unit ?? null,
    options: (d.options ?? []).map((o: any) => o.value),
    variantDefining: !!d.variantDefining,
    filterable: !!d.filterable,
    order: d.order ?? 0,
  }));
});

/* ---------- public API (async, Payload-backed) ---------- */

export async function getCategories(): Promise<CategorySummary[]> {
  const docs = await listPublished();
  const map = new Map<string, CategorySummary>();
  const lockedSample = new Set<string>(); // categories whose sample is a curated pick
  for (const doc of docs) {
    const name = categoryOf(doc);
    if (!name) continue;
    const slug = slugify(name);
    if (!map.has(name)) map.set(name, { name, slug, count: 0, sample: null });
    const c = map.get(name)!;
    c.count++;
    if (doc.primaryImage) {
      if (PREFERRED_SAMPLE_SKU[slug] && doc.sourceSku === PREFERRED_SAMPLE_SKU[slug]) {
        c.sample = doc.primaryImage; // curated pick wins and locks
        lockedSample.add(name);
      } else if (!c.sample && !lockedSample.has(name)) {
        c.sample = doc.primaryImage; // default: first published product with an image
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export async function getCategoryBySlug(slug: string): Promise<CategorySummary | null> {
  return (await getCategories()).find((c) => c.slug === slug) ?? null;
}

export async function getCatalogItemsByCategorySlug(slug: string): Promise<CatalogItem[]> {
  const docs = await listPublished();
  return docs.filter((d) => slugify(categoryOf(d)) === slug).map(toItem);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const payload = await db();
  const res = await payload.find({ collection: "products", where: { slug: { equals: slug } }, depth: 1, limit: 1 });
  return res.docs[0] ? toProduct(res.docs[0]) : null;
}

/** Resolve by the STABLE Artisan Bath Co. product id (Shopify source id) — used as a fallback when a
 *  slug no longer matches because the supplier renamed the product's handle. Not status-filtered (we never
 *  delete; a hidden/renamed product still resolves). See the product route's recovery path. */
export async function getProductBySourceId(sourceId: string): Promise<Product | null> {
  const payload = await db();
  const res = await payload.find({ collection: "products", where: { sourceId: { equals: sourceId } }, depth: 1, limit: 1 });
  return res.docs[0] ? toProduct(res.docs[0]) : null;
}

export async function getAttrDefs(category: string): Promise<AttrDef[]> {
  return (await allAttrDefs()).filter((d) => d.category === category).sort((a, b) => a.order - b.order);
}

/**
 * Mirrors `filterDefsForCategory` in lib/catalog-shared.ts — keep the two in step, they are
 * the online/offline pair. Pass `items` to drop DEAD filters (orphaned AttributeDefinitions
 * left behind when an axis is renamed; the sync never deletes defs). See the shared version
 * for the full rationale.
 */
export async function getFilterDefs(
  category: string,
  items?: { attributes: Record<string, unknown> }[],
): Promise<FilterDef[]> {
  return shapeFilterDefs(await getAttrDefs(category), items as Parameters<typeof shapeFilterDefs>[1]);
}

export async function searchAllItems(query: string): Promise<CatalogItem[]> {
  const term = normalizeSearchText(query);
  if (!term) return [];
  const docs = await listPublished();
  // Search name/SKU/tags AND attribute values (size/colour/…), unit-normalized so `96"` finds
  // 96-inch products. Excludes hide_by_default base/add-on units so a colour/size search can't
  // surface them (2026-09 — the topless-cabinet fix). Mirrors the offline `searchItems` in
  // catalog-shared.ts — keep them in step.
  return docs
    .map(toItem)
    .filter((it) => !isHiddenByDefault(it))
    .filter((it) => itemSearchText(it).includes(term))
    .sort((a, b) => soldOutRank(a) - soldOutRank(b) || (a.price ?? Infinity) - (b.price ?? Infinity)); // available first
}

export async function totalProducts(): Promise<number> {
  return (await listPublished()).length;
}

/* ---------- offline snapshot ---------- */

/** All published products in FULL (incl. descriptionHtml/variants/gallery) — the
 *  offline snapshot source. Heavier than listPublished(); used only by getSnapshot. */
const listPublishedFull = cache(async (): Promise<any[]> => {
  const payload = await db();
  const res = await payload.find({
    collection: "products",
    where: { status: { equals: "published" } },
    depth: 1,
    limit: 1000,
    pagination: false,
  });
  return res.docs;
});

/**
 * Build the offline snapshot: full products + attribute definitions + a version
 * stamp. Version = the latest `updatedAt` across published products, so it changes
 * exactly when the catalog data changes (drives "update available" on the client).
 */
export async function getSnapshot(): Promise<CatalogSnapshot> {
  const [docs, attributeDefinitions] = await Promise.all([listPublishedFull(), allAttrDefs()]);
  const products = docs.map(toProduct);
  let maxTs = 0;
  for (const d of docs) {
    const t = Date.parse(d.updatedAt ?? "");
    if (Number.isFinite(t) && t > maxTs) maxTs = t;
  }
  return {
    version: String(maxTs || 0),
    generatedAt: new Date().toISOString(),
    partner: "vanity-art",
    products,
    attributeDefinitions,
  };
}

/** All published products fully mapped — for family/configurator derivation on the
 *  server (the offline shell already holds the full set from the snapshot). Cached. */
export const getAllProducts = cache(async (): Promise<Product[]> => (await listPublishedFull()).map(toProduct));
