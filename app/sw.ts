/// <reference lib="webworker" />
//
// Summit Catalog service worker (compiled by @serwist/next → public/sw.js).
//
// Phase 1: precache the app shell so the catalog opens with no network on rep
// iPads, and cache-first the Blob image host so mirrored product photos are
// served offline by URL (no component change — see lib/mirror.ts). The per-vendor
// bulk "Download for offline" (Dexie data + eager image cache.addAll) comes in a
// later phase; this SW is the foundation it builds on.
//
// This file is intentionally excluded from the project tsconfig (it needs the
// webworker lib, which conflicts with the app's dom lib) — Serwist bundles it
// independently of the Next type-check pass.

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

// Served for any catalog navigation made offline — the client shell then renders
// the requested view from IndexedDB (see app/(frontend)/~app/page.tsx). Precached
// via next.config `additionalPrecacheEntries`.
const OFFLINE_APP_URL = "/~app";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time by @serwist/next — the precache manifest (app shell).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Spec-sheet PDFs (same-origin static, /specs/<KEY>.pdf). CacheFirst so a rep can OPEN a
    // sheet offline. MUST precede the navigate rule below: opening a PDF in a new tab is a
    // top-level navigate request, which that rule would otherwise answer with the app shell.
    // Warmed alongside images by the "Download for offline" flow (lib/offline.ts, same cache
    // name). Same-origin is deliberate — a cross-origin Blob URL can't be intercepted here.
    {
      matcher: ({ url }) => url.pathname.startsWith("/specs/"),
      handler: new CacheFirst({
        cacheName: "summit-spec-sheets",
        matchOptions: { ignoreVary: true },
        plugins: [new ExpirationPlugin({ maxEntries: 500, purgeOnQuotaError: true })],
      }),
    },
    // Navigations: always go to the network when online (fresh SSR); when the
    // network fails (offline), serve the precached /~app shell, which renders the
    // requested view from the device's cached catalog. This wins over Serwist's
    // default page cache so offline is ALWAYS the live-from-IndexedDB shell, never
    // a stale cached HTML snapshot.
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly({
        plugins: [
          {
            handlerDidError: async () =>
              (await caches.match(OFFLINE_APP_URL, { ignoreSearch: true })) ?? Response.error(),
          },
        ],
      }),
    },
    // Summit-owned Blob image host: cache-first (immutable, content-hashed WebP with a
    // 30-day cache header). Foundation for offline product photos.
    //
    // ⚠ PHASE 3 PREREQUISITE: the catalog's <img> tags are currently plain
    // cross-origin requests → the browser gets OPAQUE responses (status 0), which
    // CacheFirst deliberately won't store (and which each cost ~7MB of quota
    // "padding" — fatal to the "download all vendors" goal). Vercel Blob DOES send
    // `Access-Control-Allow-Origin: *` (verified), so Phase 3 will add
    // `crossorigin="anonymous"` to the image tags → real CORS responses that cache
    // at true size. Until then this rule only stores same-origin / CORS responses;
    // opaque image hits pass through uncached (harmless — just not-yet-offline).
    {
      matcher: ({ url }) => url.hostname.endsWith(".blob.vercel-storage.com"),
      handler: new CacheFirst({
        cacheName: "summit-blob-images",
        // Match by URL only, IGNORING Vary. Critical for offline: the bulk "Download
        // for offline" flow (lib/offline.ts) writes each image via cache.put(url,…),
        // keyed by a synthetic Request. If the Blob response carries a `Vary` header,
        // the default cache.match() compares request headers and FAILS to match the
        // real <img> (crossorigin) request against that synthetic key — so the image
        // is cached but never served offline (question marks). Images viewed online
        // work because CacheFirst stored them under the exact request. Content-hashed,
        // immutable URLs make URL-only matching correct + safe. (Bug found 2026-07-29.)
        matchOptions: { ignoreVary: true },
        plugins: [
          new ExpirationPlugin({
            maxEntries: 6000, // ample headroom over the current ~1,250 images
            // NO maxAgeSeconds on purpose: the "Download for offline" flow writes
            // images straight into this cache (lib/offline.ts), which the plugin
            // doesn't timestamp — an age check would then treat them as stale and
            // refuse to serve them offline. Content-hashed URLs never go stale anyway.
            purgeOnQuotaError: true, // let the browser reclaim under storage pressure
          }),
        ],
      }),
    },
    // Everything else: Serwist's sensible defaults (static assets, pages, etc.).
    ...defaultCache,
  ],
});

serwist.addEventListeners();
