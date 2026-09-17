"use client";

import { useEffect } from "react";
import { warmIfEmpty } from "@/lib/catalog-source";

/**
 * Invisible: on first online visit, downloads the catalog snapshot into IndexedDB
 * so the app can render offline afterward. No-op once cached (Phase-3's Download
 * button handles deliberate refreshes). Rendered in the frontend layout.
 */
export function SnapshotWarmer() {
  useEffect(() => {
    void warmIfEmpty();
  }, []);
  return null;
}
