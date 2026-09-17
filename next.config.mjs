import { withPayload } from "@payloadcms/next/withPayload";
import withSerwistInit from "@serwist/next";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

// @serwist/next precaches build assets (JS/CSS) but NOT App-Router page HTML, so
// the offline shell route must be added to the precache explicitly. Revision = a
// hash of the shell source, so the precached copy auto-invalidates when we edit it.
const rev = (relPath) =>
  createHash("sha256").update(readFileSync(new URL(relPath, import.meta.url))).digest("hex").slice(0, 12);

const offlineAppRevision = rev("./app/(frontend)/~app/page.tsx");
// Same-origin UI images used in the app chrome — precache so they render offline
// (Serwist precaches .next build assets but not arbitrary /public images).
const publicImageEntries = ["/htc-oval.png", "/icons/icon-192.png"].map((url) => ({
  url,
  revision: rev(`./public${url}`),
}));
// Every /public/lowes image (static "Toilets" pages) — precache so the offline shell
// renders toilets with no signal. Directory-driven: dropping a new toilet's images
// into /public/lowes auto-includes them here with no code change (matches the
// replicable "asset → static page → offline" toilet pipeline).
const lowesImageEntries = readdirSync(new URL("./public/lowes", import.meta.url), { recursive: true })
  .map((p) => String(p).split(/[\\/]/).join("/"))
  .filter((p) => /\.(webp|jpe?g|png)$/i.test(p))
  .map((p) => {
    const url = `/lowes/${p}`;
    return { url, revision: rev(`./public${url}`) };
  });

// PWA / offline support (Phase 1: app-shell precache so the catalog opens offline
// on rep iPads). Serwist compiles app/sw.ts → public/sw.js and auto-registers it
// on the client (register defaults to true). Disabled in dev so it never fights
// the dev server / HMR — verify offline behavior with a production build instead.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Precache the offline app shell (see app/sw.ts — served for offline navigations)
  // plus the same-origin UI images so the header logo etc. render offline.
  additionalPrecacheEntries: [
    { url: "/~app", revision: offlineAppRevision },
    ...publicImageEntries,
    ...lowesImageEntries,
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Images are mirrored to HTC-owned Vercel Blob storage (see lib/mirror.ts) and
  // served via plain <img>. We deliberately NEVER use next/image: Vercel bills its
  // Image Optimization per source image, which is brutal for a ~1,250-image catalog
  // and pointless for simple product shots (already downscaled + WebP'd at ingest).
  // `unoptimized: true` is a hard guardrail — a stray next/image can't silently
  // route through (and get billed by) the paid optimizer.
  images: { unoptimized: true },
};

// Compose both plugins: Serwist wraps the Payload-wrapped config.
export default withSerwist(withPayload(nextConfig));
