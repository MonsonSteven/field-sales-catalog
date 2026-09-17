import { withPayload } from "@payloadcms/next/withPayload";
import withSerwistInit from "@serwist/next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// @serwist/next precaches build assets (JS/CSS) but NOT App-Router page HTML, so
// the offline shell route must be added to the precache explicitly. Revision = a
// hash of the shell source, so the precached copy auto-invalidates when we edit it.
const rev = (relPath) =>
  createHash("sha256").update(readFileSync(new URL(relPath, import.meta.url))).digest("hex").slice(0, 12);

const offlineAppRevision = rev("./app/(frontend)/~app/page.tsx");
// Same-origin UI images used in the app chrome — precache so they render offline
// (Serwist precaches .next build assets but not arbitrary /public images).
// Same-origin UI + placeholder images used in the app chrome — precache so they
// render offline (Serwist precaches .next build assets but not arbitrary /public images).
const publicImageEntries = [
  "/summit-logo.svg",
  "/placeholders/vanities.svg",
  "/placeholders/faucets.svg",
  "/placeholders/mirrors.svg",
  "/placeholders/toilets.svg",
].map((url) => ({ url, revision: rev(`./public${url}`) }));

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
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Product images are served via plain <img> (in production they'd be mirrored to
  // Vercel Blob). We deliberately NEVER use next/image: Vercel bills Image Optimization
  // per source image, which is pointless for simple product shots. `unoptimized: true`
  // is a hard guardrail so a stray next/image can't silently route through the paid optimizer.
  images: { unoptimized: true },
};

// Compose both plugins: Serwist wraps the Payload-wrapped config.
export default withSerwist(withPayload(nextConfig));
