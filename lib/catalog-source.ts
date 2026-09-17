// catalog-source.ts — CLIENT data layer. The single place the browser gets catalog
// data: cache-first from Dexie (instant, offline-capable) with a background network
// revalidate; write-through so every online visit refreshes the offline copy.
//
// Auth-aware: /tools/snapshot will be gated by the rep login, so a 401 is surfaced
// as `unauthorized` (the auth guard redirects to /login) rather than an error.
//
// CLIENT-ONLY — imports Dexie (lib/db). Never import from a server component.
import { useEffect, useState } from "react";
import type { CatalogSnapshot } from "./helpers";
import { readSnapshot, saveSnapshot, cachedVersion } from "./db";

export * from "./catalog-shared"; // re-export the pure derivations for view code

const SNAPSHOT_URL = "/tools/snapshot";

export type CatalogStatus = "ok" | "unauthorized" | "offline-no-data";

export interface CatalogLoadResult {
  status: CatalogStatus;
  snapshot: CatalogSnapshot | null;
  fromCache: boolean;
}

// In-memory memo for the session so repeated view reads don't re-open IndexedDB.
let memo: CatalogSnapshot | null = null;

type NetworkResult =
  | { ok: true; snapshot: CatalogSnapshot }
  | { ok: false; unauthorized: boolean };

async function fetchFromNetwork(): Promise<NetworkResult> {
  const res = await fetch(SNAPSHOT_URL, { credentials: "include", cache: "no-store" });
  if (res.status === 401 || res.status === 403) return { ok: false, unauthorized: true };
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
  const snapshot = (await res.json()) as CatalogSnapshot;
  return { ok: true, snapshot };
}

/**
 * Pull a fresh snapshot from the network and persist it to Dexie (write-through).
 * Used by the background revalidate, the online "warmer", and the Phase-3 Download
 * button. Falls back to the cached copy on 401/offline so callers always get
 * whatever data is available.
 */
export async function refreshFromNetwork(): Promise<CatalogLoadResult> {
  try {
    const r = await fetchFromNetwork();
    if (!r.ok) {
      const cached = await readSnapshot();
      return { status: "unauthorized", snapshot: cached, fromCache: !!cached };
    }
    await saveSnapshot(r.snapshot);
    memo = r.snapshot;
    return { status: "ok", snapshot: r.snapshot, fromCache: false };
  } catch {
    const cached = await readSnapshot();
    if (cached) {
      memo = cached;
      return { status: "ok", snapshot: cached, fromCache: true };
    }
    return { status: "offline-no-data", snapshot: null, fromCache: false };
  }
}

/**
 * Get the catalog for rendering. Cache-first: returns the Dexie copy instantly (or
 * the memo) and revalidates from the network in the background; only blocks on the
 * network when there's nothing cached yet.
 */
export async function loadCatalog(): Promise<CatalogLoadResult> {
  if (memo) {
    void refreshFromNetwork(); // keep it fresh, don't block
    return { status: "ok", snapshot: memo, fromCache: true };
  }
  const cached = await readSnapshot();
  if (cached) {
    memo = cached;
    void refreshFromNetwork();
    return { status: "ok", snapshot: cached, fromCache: true };
  }
  // Nothing cached — must hit the network (first-ever load / not yet downloaded).
  return refreshFromNetwork();
}

/**
 * Populate Dexie on first online visit only (when nothing is cached yet). Avoids
 * re-downloading the full snapshot on every page load — deliberate refreshes go
 * through the Phase-3 "Download for offline" button (or refreshFromNetwork()).
 */
export async function warmIfEmpty(): Promise<void> {
  try {
    if (await cachedVersion()) return; // already have a copy
    await refreshFromNetwork();
  } catch {
    /* offline / not logged in — nothing to warm, ignore */
  }
}

/** Is a newer snapshot available on the server than what we have cached? (online) */
export async function hasUpdate(): Promise<boolean> {
  try {
    const r = await fetchFromNetwork();
    if (!r.ok) return false;
    const local = await cachedVersion(r.snapshot.partner);
    return local !== r.snapshot.version;
  } catch {
    return false;
  }
}

/** React hook: load the catalog for a view. Returns loading + result state. */
export function useCatalog(): { loading: boolean } & Partial<CatalogLoadResult> {
  const [state, setState] = useState<{ loading: boolean } & Partial<CatalogLoadResult>>({ loading: true });
  useEffect(() => {
    let alive = true;
    loadCatalog().then((r) => alive && setState({ loading: false, ...r }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
