# Product Catalog PWA — Demo

An **offline-first product catalog** for a home-improvement contractor's field sales reps
(shown here as the fictional *Summit Home Improvement*, supplied by the fictional *Artisan Bath Co.*).
Reps browse a supplier catalog on an iPad — often with no signal in a customer's home — build a
quote, and hide prices on demand while presenting.

> **Portfolio note.** This is a public, storefront-focused demo built from a real system I designed
> and shipped. The client and supplier are anonymized and **all catalog data is synthetic** — product
> names, SKUs, prices, and images are invented. The real system's confidential/supplier-coupled layers
> (the dealer-price ingestion pipeline, SKU decoding, and the modular configurator) are intentionally
> **not** included in this public demo.

---

## Highlights

- **Offline-first PWA.** Online, the app pulls a full catalog **snapshot** and writes it through to
  **IndexedDB (Dexie)**; offline, it renders entirely from that cached copy. The installed app opens
  a hash-routed client shell (`/~app`) so the service worker always serves one precached document —
  no "shell served at a mismatched path" crash that iOS Safari is strict about.
- **Presentation mode (price hiding).** A per-device toggle sets a `data-hide-price` attribute on
  `<html>` **before first paint** (inline script, mirroring the theme-flash pattern), so a price can
  never flash on screen in front of a customer — one CSS rule then hides every price element, print
  included.
- **CMS with a synced/overlay split.** Products are managed in **Payload CMS**: a locked "synced"
  layer (supplier-owned fields, overwritten each import) and an editor-safe "overlay" layer
  (hand-set price override, category correction, publish status) that import never touches — enforced
  with field-level access control.
- **On-device estimate builder.** Reps assemble a quote that lives in IndexedDB and works fully
  offline, with a header badge and review screen kept in sync via a tiny pub/sub.
- **Typed, category-driven attributes.** Product-type-specific fields live in an `attributes` JSON
  whose shape is described by `AttributeDefinition` records owned by a Category — so adding a category
  is data entry, not a schema migration.

## Stack

Next.js (App Router) · TypeScript · **Payload CMS** · Neon Postgres · Vercel (Blob for images) ·
**Serwist** service worker · Dexie (IndexedDB). Tests run on the Node built-in test runner via `tsx`
(**217 passing**).

## Auth

The storefront sits behind a real session boundary (Payload auth; the SSR pages read data through
Payload's local API, which bypasses collection access control, so the guard is the boundary). For
this public demo, `DEMO_OPEN_ACCESS=true` removes the login wall so anyone can browse — the auth code
stays intact and is used whenever the flag is off. The Payload **admin** keeps its own login.

## Run it

```bash
npm install
cp .env.example .env      # set DATABASE_URI + PAYLOAD_SECRET; PAYLOAD_DB_PUSH=true on first run
npm run dev               # http://localhost:3000  (create the first admin at /admin)
npm run seed              # load the synthetic Artisan Bath Co. catalog
npm test                 # 217 tests
```

Full Neon + Vercel steps are in [`DEMO-SETUP.md`](DEMO-SETUP.md). A synthetic seed
(`scripts/seed.mjs`) populates a fictional catalog with invented prices and neutral placeholder
images (`public/placeholders/`).
