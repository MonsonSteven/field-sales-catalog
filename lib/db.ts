// Offline data store (IndexedDB via Dexie). CLIENT-ONLY — never import from a
// server component or route handler; IndexedDB doesn't exist in Node.
//
// Holds the catalog snapshot on-device so the app renders offline. Products are
// stored individually (indexed by partner + category) so per-vendor download and
// eviction (Phase 3) can operate per partner without rewriting the whole store.
import Dexie, { type Table } from "dexie";
import type { Product } from "@/schema/types";
import type { AttrDef, CatalogSnapshot } from "./helpers";

/** A stored product record — the full Product plus its partner/slug/category keys
 *  hoisted out for indexing. */
export interface StoredProduct extends Product {
  // `slug` and `category` already exist on Product; `partner` too. Dexie indexes
  // them directly (see schema below). No extra fields needed.
}

/** Per-partner snapshot metadata (version + when it was fetched). */
export interface SnapshotMeta {
  partner: string; // primary key
  version: string;
  generatedAt: string;
  fetchedAt: string;
}

/** A single priced line on a Product Estimate — a captured snapshot at add-time so
 *  the sheet never silently changes if catalog pricing later updates. */
export interface EstimateLine {
  id: string; // unique line id (crypto.randomUUID)
  source: "vanity-art" | "toilet";
  slug: string; // product slug, to link back to the detail page
  /** Stable Artisan Bath Co. product id (Shopify source id). The slug is the supplier's handle and CHANGES when
   *  the supplier renames a product (the sync's `identity-changed` case), which would 404 the line's link.
   *  Captured at add-time so the link can recover the (renamed) product by a key that never moves.
   *  Optional: lines added before this shipped won't have it — they just fall back to slug-only. */
  sourceId?: string | null;
  title: string;
  sku: string | null;
  image: string | null;
  variantLabel: string | null; // e.g. "White Engineered Marble Top" / "Biscuit"
  unitPrice: number; // item+install price captured when added
  qty: number;
}

/** Per-device identity for error reports (2026-09-11). Under a SHARED rep login the server can't
 *  tell devices apart, so the app mints its own stable id. Stored in IndexedDB (NOT localStorage):
 *  iOS evicts localStorage after ~7 days of disuse, which would silently reset the id — Dexie rides
 *  the app's `navigator.storage.persist()` grant, same durability as the catalog cache + estimates.
 *  `repName` is an OPTIONAL human label (the deferred "B" layer); the id is the load-bearing anchor. */
export interface DeviceRecord {
  id: string; // fixed primary key ("self") — one row per device
  deviceId: string; // app-minted UUID; the report identity
  repName?: string | null; // optional label, unset today (the hook for a future name-capture UI)
}

/** An error report that couldn't be sent (device offline) — queued to flush on reconnect. Field
 *  reps are often offline, and those are exactly the crashes worth keeping. `payload` is the raw
 *  report body; the server sanitizes/caps on receipt. */
export interface PendingErrorReport {
  id: string; // crypto.randomUUID
  payload: Record<string, unknown>;
  queuedAt: string; // ISO
}

/** A Product Estimate a rep builds for one customer/appointment. Stored on-device. */
export interface Estimate {
  id: string; // primary key (crypto.randomUUID)
  name: string; // display label (defaults to a dated name; rep can rename)
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  preparedBy: string;
  createdAt: string;
  updatedAt: string;
  lines: EstimateLine[];
}

class CatalogDB extends Dexie {
  products!: Table<StoredProduct, string>; // keyed by slug
  attributeDefinitions!: Table<AttrDef & { pk: string }, string>; // keyed by pk = `${category}::${key}`
  meta!: Table<SnapshotMeta, string>; // keyed by partner
  estimates!: Table<Estimate, string>; // keyed by id
  device!: Table<DeviceRecord, string>; // single row, keyed by "self"
  pendingErrors!: Table<PendingErrorReport, string>; // keyed by id (offline error queue)

  constructor() {
    super("summit-catalog");
    this.version(1).stores({
      products: "slug, partner, category",
      attributeDefinitions: "pk, category",
      meta: "partner",
    });
    // v2 adds Product Estimates (client-side, offline-durable). Additive migration —
    // existing catalog data is preserved; Dexie just creates the new table.
    this.version(2).stores({
      estimates: "id, updatedAt",
    });
    // v3 adds device identity + the offline error-report queue (2026-09-11). Additive; existing
    // catalog/estimate data is untouched. This is a CLIENT (IndexedDB) migration — it ships with the
    // deploy and needs no Postgres DDL (the server-side error_reports TABLE does; see db/error_reports.sql).
    this.version(3).stores({
      device: "id",
      pendingErrors: "id, queuedAt",
    });
  }
}

let _db: CatalogDB | null = null;

/** Lazily construct the DB (only in the browser) so importing this module in a
 *  server bundle never touches IndexedDB. */
export function getDB(): CatalogDB {
  if (typeof window === "undefined") {
    throw new Error("lib/db.ts is client-only — IndexedDB is unavailable on the server.");
  }
  if (!_db) _db = new CatalogDB();
  return _db;
}

/** Replace a partner's cached catalog with a fresh snapshot (idempotent upsert). */
export async function saveSnapshot(snapshot: CatalogSnapshot): Promise<void> {
  const db = getDB();
  const attrRows = snapshot.attributeDefinitions.map((d) => ({ ...d, pk: `${d.category}::${d.key}` }));
  await db.transaction("rw", db.products, db.attributeDefinitions, db.meta, async () => {
    // Single partner today: replace the whole product set. (Products store their
    // partner as the DISPLAY name e.g. "Artisan Bath Co.", not the snapshot's slug
    // "vanity-art", so DON'T filter by snapshot.partner here — that mismatch
    // silently deleted nothing and, in readSnapshot, matched nothing. Revisit with
    // a normalized partner-slug key when a second partner is added.)
    await db.products.clear();
    await db.products.bulkPut(snapshot.products as StoredProduct[]);
    // Attribute defs aren't partner-scoped in the store; replace all for simplicity
    // (single partner today; revisit when a second partner's defs coexist).
    await db.attributeDefinitions.clear();
    await db.attributeDefinitions.bulkPut(attrRows);
    await db.meta.put({
      partner: snapshot.partner,
      version: snapshot.version,
      generatedAt: snapshot.generatedAt,
      fetchedAt: new Date().toISOString(),
    });
  });
}

/** Read the cached snapshot back (or null if nothing is stored yet). */
export async function readSnapshot(partner = "vanity-art"): Promise<CatalogSnapshot | null> {
  const db = getDB();
  const meta = await db.meta.get(partner);
  if (!meta) return null;
  // Return the whole stored set (single partner today — see saveSnapshot note on
  // why we don't filter by the partner key here).
  const [products, attrRows] = await Promise.all([
    db.products.toArray(),
    db.attributeDefinitions.toArray(),
  ]);
  if (products.length === 0) return null;
  const attributeDefinitions: AttrDef[] = attrRows.map(({ pk, ...d }) => d);
  return { version: meta.version, generatedAt: meta.generatedAt, partner, products, attributeDefinitions };
}

/** Version currently cached for a partner (or null). Cheap staleness check. */
export async function cachedVersion(partner = "vanity-art"): Promise<string | null> {
  const db = getDB();
  return (await db.meta.get(partner))?.version ?? null;
}
