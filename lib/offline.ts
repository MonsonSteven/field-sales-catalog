// Offline download orchestration (CLIENT-ONLY). Fetches the catalog data snapshot
// (→ IndexedDB, via catalog-source) AND caches every product image into the same
// Cache Storage bucket the service worker's cache-first rule reads (summit-blob-images),
// so the whole catalog — pictures included — is available with no network.
//
// Images are cached as CORS responses (the <img> tags now set crossorigin), so they
// store at real size instead of opaque ~7MB-padded blobs.
import type { CatalogSnapshot } from "./helpers";
import { refreshFromNetwork } from "./catalog-source";
import { readSnapshot } from "./db";
import { SPEC_SHEETS } from "./spec-sheets.data";

// MUST match the cacheNames in app/sw.ts.
const IMAGE_CACHE = "summit-blob-images";
const SPEC_CACHE = "summit-spec-sheets";
const CONCURRENCY = 8;

/** Same-origin spec-sheet PDF URLs (one per available sheet) — cached for offline "Spec Sheet". */
function specUrls(): string[] {
  return [...SPEC_SHEETS].map((key) => `/specs/${key}.pdf`);
}

/**
 * Every unique product image URL in the snapshot (primary + gallery + per-variant).
 * Variant photos (Slice 1c) MUST be included or the in-place selector would swap to an
 * uncached image offline — which is the exact in-home, no-signal case the download exists
 * for. Dedup matters: a variant photo is often also a gallery image.
 */
export function collectImageUrls(snapshot: CatalogSnapshot): string[] {
  const set = new Set<string>();
  for (const p of snapshot.products) {
    if (p.images?.primary) set.add(p.images.primary);
    for (const g of p.images?.gallery ?? []) if (g) set.add(g);
    // Variant photos are the bulk of the payload (~2,150 images), so skip them for
    // hide-by-default products — kits + base/storage cabinets that aren't in the default
    // browse. Measured: including them costs ~47MB extra for products reps rarely open;
    // their primary + gallery are still cached, so those pages still work offline.
    const hidden = p.attributes?.["hide_by_default"];
    if (hidden === true || hidden === "true") continue;
    for (const v of p.variants ?? []) if (v?.image) set.add(v.image);
  }
  return [...set];
}

export interface OfflineProgress {
  phase: "data" | "images" | "done";
  done: number;
  total: number;
}

export interface OfflineStatus {
  dataCached: boolean;
  imagesCached: number;
  imagesTotal: number;
  complete: boolean;
}

/** How much of the catalog is currently available offline. */
export async function offlineStatus(): Promise<OfflineStatus> {
  const snap = await readSnapshot();
  if (!snap) return { dataCached: false, imagesCached: 0, imagesTotal: 0, complete: false };
  const urls = new Set(collectImageUrls(snap));
  const specPaths = new Set(specUrls()); // relative /specs/… — spec cache keys are absolute
  let imagesCached = 0;
  try {
    const cache = await caches.open(IMAGE_CACHE);
    for (const req of await cache.keys()) if (urls.has(req.url)) imagesCached++;
    const specCache = await caches.open(SPEC_CACHE);
    for (const req of await specCache.keys()) {
      try {
        if (specPaths.has(new URL(req.url).pathname)) imagesCached++;
      } catch {
        /* skip unparseable key */
      }
    }
  } catch {
    /* Cache Storage unavailable — treat as none cached */
  }
  // Spec PDFs are counted alongside images as "offline assets" — a few dozen next to ~1,250
  // images — so `complete` (and the auto-download gate) accounts for them too.
  const total = urls.size + specPaths.size;
  return {
    dataCached: true,
    imagesCached,
    imagesTotal: total,
    complete: total > 0 && imagesCached >= total,
  };
}

/**
 * Download the whole catalog for offline use: refresh the data snapshot, then
 * fetch + cache every image (skipping ones already cached), reporting progress.
 * Requests persistent storage so the browser is less likely to evict it.
 */
export async function downloadForOffline(
  onProgress: (p: OfflineProgress) => void,
): Promise<{ ok: boolean; images: { cached: number; failed: number } }> {
  // Ask the browser not to evict our cache (best-effort; iOS honors partially).
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }

  // 1) Data snapshot → IndexedDB.
  onProgress({ phase: "data", done: 0, total: 1 });
  const res = await refreshFromNetwork();
  if (res.status !== "ok" || !res.snapshot) {
    return { ok: false, images: { cached: 0, failed: 0 } };
  }
  onProgress({ phase: "data", done: 1, total: 1 });

  // 2) Assets → Cache Storage (bounded concurrency, skip already-cached). Product images go to
  //    the Blob-image cache (CORS); spec-sheet PDFs are same-origin and go to the spec cache the
  //    SW's /specs rule reads — so both open with no network in the field.
  const imgCache = await caches.open(IMAGE_CACHE);
  const specCache = await caches.open(SPEC_CACHE);
  type Item = { url: string; cache: Cache; cors: boolean };
  const items: Item[] = [
    ...collectImageUrls(res.snapshot).map((url) => ({ url, cache: imgCache, cors: true })),
    ...specUrls().map((url) => ({ url, cache: specCache, cors: false })),
  ];
  let cached = 0;
  let failed = 0;
  let cursor = 0;
  const report = () => onProgress({ phase: "images", done: cached + failed, total: items.length });

  async function worker() {
    while (cursor < items.length) {
      const { url, cache, cors } = items[cursor++];
      try {
        if (await cache.match(url)) {
          cached++;
        } else {
          const r = cors
            ? await fetch(url, { mode: "cors", credentials: "omit" })
            : await fetch(url, { credentials: "omit" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          await cache.put(url, r.clone());
          cached++;
        }
      } catch {
        failed++;
      }
      report();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

  onProgress({ phase: "done", done: items.length, total: items.length });
  return { ok: true, images: { cached, failed } };
}
