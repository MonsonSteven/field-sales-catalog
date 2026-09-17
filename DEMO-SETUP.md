# Demo setup — Neon + Vercel

Standing up the catalog demo on your own personal Neon + Vercel. ~15 minutes.

## 1. Database (Neon)

1. Create a Neon project (free tier is fine). Copy the **pooled** connection string.
2. Locally:
   ```bash
   npm install
   cp .env.example .env
   ```
   In `.env` set:
   - `DATABASE_URI` = your Neon pooled string
   - `PAYLOAD_SECRET` = `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `PAYLOAD_DB_PUSH=true`  (first run only — lets Payload create the tables)
   - `DEMO_OPEN_ACCESS=true` (open storefront, no login wall)

## 2. Create tables, seed, run

```bash
npm run dev            # first boot with PAYLOAD_DB_PUSH=true creates the tables
# open http://localhost:3000/admin once and create the first admin user
npm run seed           # loads the synthetic Artisan Bath Co. catalog
```

Then browse the storefront at `http://localhost:3000` (open access) and manage products in
`/admin`. Re-run `npm run seed` anytime to reset the catalog.

> After the first successful boot you can set `PAYLOAD_DB_PUSH=` (blank) again.

## 3. Deploy (Vercel)

1. Push this repo to your personal GitHub, then **Import Project** in Vercel.
2. Project → **Settings → Environment Variables**:

   | Variable | Value |
   |---|---|
   | `DATABASE_URI` | your Neon pooled string |
   | `PAYLOAD_SECRET` | the same secret |
   | `DEMO_OPEN_ACCESS` | `true` |
   | `PAYLOAD_DB_PUSH` | leave unset in prod |

3. **Build command:** `npm run build` (it runs `next build --webpack` — required so the Serwist
   service worker is bundled; Next 16's default Turbopack build does not hook it).
4. After the first deploy, seed the deployed DB once from your machine (same Neon DB):
   ```bash
   npm run seed
   ```

## Notes

- **Open access** (`DEMO_OPEN_ACCESS=true`) removes the storefront login wall for the public demo.
  The real Payload auth boundary is still in the code and is used whenever the flag is off. The
  `/admin` CMS keeps its own login regardless.
- All catalog data is synthetic and safe to wipe/re-seed. Images are neutral placeholders in
  `public/placeholders/`.
- Presentation mode (hide prices) is the eye toggle in the header — try it on a product page.
