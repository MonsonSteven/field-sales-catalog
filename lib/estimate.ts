// Product Estimate store (CLIENT-ONLY) — the rep's on-device selection layer.
// Estimates live in IndexedDB (Dexie, lib/db) so building/reviewing works fully
// offline. A tiny pub/sub notifies the header badge + review screen on any change.
//
// Never import from a server component — it touches IndexedDB (browser-only).
import { useEffect, useState } from "react";
import { getDB, type Estimate, type EstimateLine } from "./db";

export type { Estimate, EstimateLine };

const ACTIVE_KEY = "summit-active-estimate"; // localStorage: which estimate is being built

/* ---------- change notification (badge + views stay in sync) ---------- */
const listeners = new Set<() => void>();
function notify() {
  for (const fn of listeners) fn();
}
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------- helpers ---------- */
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const now = () => new Date().toISOString();

/** Link back to a line's product page. Toilets are static (stable slugs). Artisan Bath Co. lines carry
 *  the stable `sourceId` as `?sid=` so the page can recover the product if the supplier has since renamed it
 *  (its slug/handle changed) — see the product route + offline shell. Pure/testable. */
export function productHref(line: Pick<EstimateLine, "source" | "slug" | "sourceId">): string {
  if (line.source === "toilet") return `/lowes/${line.slug}`;
  const q = line.sourceId ? `?sid=${encodeURIComponent(line.sourceId)}` : "";
  return `/product/${line.slug}${q}`;
}

export function estimateSubtotal(e: Estimate | null | undefined): number {
  if (!e) return 0;
  return e.lines.reduce((sum, l) => sum + (l.unitPrice || 0) * (l.qty || 0), 0);
}
export function lineCount(e: Estimate | null | undefined): number {
  return e ? e.lines.reduce((n, l) => n + (l.qty || 0), 0) : 0;
}

/* ---------- active-estimate tracking ---------- */
export function getActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function setActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage disabled — active id just won't persist across reloads */
  }
}

/* ---------- CRUD ---------- */
export async function listEstimates(): Promise<Estimate[]> {
  const db = getDB();
  const all = await db.estimates.toArray();
  return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getEstimate(id: string): Promise<Estimate | undefined> {
  return getDB().estimates.get(id);
}

export async function createEstimate(): Promise<Estimate> {
  const ts = now();
  const est: Estimate = {
    id: uid(),
    name: `Estimate — ${new Date().toLocaleDateString()}`,
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    preparedBy: "",
    createdAt: ts,
    updatedAt: ts,
    lines: [],
  };
  await getDB().estimates.put(est);
  setActiveId(est.id);
  notify();
  return est;
}

/** The estimate the rep is currently building — the active one, or a fresh one. */
export async function getOrCreateActive(): Promise<Estimate> {
  const id = getActiveId();
  if (id) {
    const existing = await getEstimate(id);
    if (existing) return existing;
  }
  return createEstimate();
}

export async function getActive(): Promise<Estimate | null> {
  const id = getActiveId();
  if (!id) return null;
  return (await getEstimate(id)) ?? null;
}

export function setActive(id: string) {
  setActiveId(id);
  notify();
}

async function save(est: Estimate): Promise<Estimate> {
  est.updatedAt = now();
  await getDB().estimates.put(est);
  notify();
  return est;
}

/** Add a line to the active estimate (creating one if needed). Same product+variant
 *  bumps qty instead of duplicating. Returns the updated estimate. */
export async function addLine(line: Omit<EstimateLine, "id" | "qty"> & { qty?: number }): Promise<Estimate> {
  const est = await getOrCreateActive();
  const qty = line.qty ?? 1;
  const match = est.lines.find(
    (l) => l.source === line.source && l.slug === line.slug && l.variantLabel === line.variantLabel,
  );
  if (match) match.qty += qty;
  else est.lines.push({ ...line, qty, id: uid() });
  return save(est);
}

export async function setLineQty(estId: string, lineId: string, qty: number): Promise<Estimate | null> {
  const est = await getEstimate(estId);
  if (!est) return null;
  const l = est.lines.find((x) => x.id === lineId);
  if (!l) return est;
  if (qty <= 0) est.lines = est.lines.filter((x) => x.id !== lineId);
  else l.qty = qty;
  return save(est);
}

export async function removeLine(estId: string, lineId: string): Promise<Estimate | null> {
  const est = await getEstimate(estId);
  if (!est) return null;
  est.lines = est.lines.filter((x) => x.id !== lineId);
  return save(est);
}

export async function updateFields(
  estId: string,
  patch: Partial<Pick<Estimate, "name" | "customerName" | "customerEmail" | "customerPhone" | "preparedBy">>,
): Promise<Estimate | null> {
  const est = await getEstimate(estId);
  if (!est) return null;
  Object.assign(est, patch);
  return save(est);
}

export async function deleteEstimate(id: string): Promise<void> {
  await getDB().estimates.delete(id);
  if (getActiveId() === id) setActiveId(null);
  notify();
}

/* ---------- React hooks ---------- */

/** Live line-count of the active estimate — for the header badge. */
export function useEstimateCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const read = () =>
      getActive()
        .then((e) => alive && setN(lineCount(e)))
        .catch(() => {});
    read();
    return subscribe(read);
  }, []);
  return n;
}

/** Live view of the active estimate (or a specific one by id). */
export function useEstimate(id?: string): { loading: boolean; estimate: Estimate | null } {
  const [state, setState] = useState<{ loading: boolean; estimate: Estimate | null }>({
    loading: true,
    estimate: null,
  });
  useEffect(() => {
    let alive = true;
    const read = () =>
      (id ? getEstimate(id).then((e) => e ?? null) : getActive())
        .then((e) => alive && setState({ loading: false, estimate: e }))
        .catch(() => alive && setState({ loading: false, estimate: null }));
    read();
    return subscribe(read);
  }, [id]);
  return state;
}
