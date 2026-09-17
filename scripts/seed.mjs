// Synthetic catalog seed (portfolio demo).
//
// Populates Payload with a fully-invented "Artisan Bath Co." catalog — one partner,
// four categories, their typed attribute definitions, and a set of published products
// with variants, plausible (illustrative) prices and neutral placeholder images.
//
// Nothing here is real: names, SKUs, prices and images are made up. The pricing
// "formula" is a deliberately generic markup (× 2), NOT any real business formula.
//
// Idempotent: clears the catalog collections, then recreates them.
//
// Run (after setting DATABASE_URI + PAYLOAD_SECRET in .env):
//   npm run seed
//
// Auth: the Payload LOCAL API bypasses collection access control, so no login is needed.

import { getPayload } from "payload";

// Load .env for the standalone process (Next does this for the app, not for scripts).
try { process.loadEnvFile(".env"); } catch { /* fall back to ambient env */ }

const config = (await import("../payload.config.ts")).default;

const round = (n) => Math.round(n);
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ── attribute schemas per category ───────────────────────────
const ATTR_DEFS = {
  Vanities: [
    { key: "size", label: "Size", type: "dimension", unit: "in", variantDefining: true, filterable: true, order: 1 },
    { key: "color", label: "Color", type: "enum", options: ["White", "Grey", "Espresso", "Navy"], variantDefining: true, filterable: true, order: 2 },
    { key: "top_material", label: "Top Material", type: "enum", options: ["Quartz", "Carrara Marble", "Cultured Marble"], variantDefining: false, filterable: true, order: 3 },
  ],
  Faucets: [
    { key: "finish", label: "Finish", type: "enum", options: ["Chrome", "Brushed Nickel", "Matte Black", "Brushed Gold"], variantDefining: true, filterable: true, order: 1 },
    { key: "mount", label: "Mount", type: "enum", options: ["Single-Hole", "Widespread", "Wall-Mount"], variantDefining: false, filterable: true, order: 2 },
  ],
  Mirrors: [
    { key: "size", label: "Size", type: "dimension", unit: "in", variantDefining: true, filterable: true, order: 1 },
    { key: "style", label: "Style", type: "enum", options: ["Framed", "Frameless", "LED"], variantDefining: false, filterable: true, order: 2 },
  ],
  Toilets: [
    { key: "type", label: "Type", type: "enum", options: ["One-Piece", "Two-Piece"], variantDefining: false, filterable: true, order: 1 },
    { key: "flush", label: "Flush", type: "enum", options: ["Single", "Dual"], variantDefining: true, filterable: true, order: 2 },
  ],
};

// ── product blueprints ───────────────────────────────────────
// Each: [model, base customer price, sizes|null, colors|finishes|null]
const BLUEPRINTS = {
  Vanities: [
    ["Aspen", 1290, [24, 36, 48], ["White", "Grey", "Espresso"], "Quartz"],
    ["Sedona", 1650, [30, 48, 60], ["White", "Navy"], "Carrara Marble"],
    ["Cascade", 980, [24, 30, 36], ["White", "Grey"], "Cultured Marble"],
    ["Monterey", 2350, [48, 60, 72], ["Espresso", "Navy"], "Quartz"],
    ["Harbor", 1150, [30, 36], ["White", "Grey", "Espresso"], "Quartz"],
    ["Willow", 890, [24, 30], ["White"], "Cultured Marble"],
  ],
  Faucets: [
    ["Rill", 210, null, ["Chrome", "Brushed Nickel", "Matte Black"], "Single-Hole"],
    ["Cove", 340, null, ["Brushed Nickel", "Matte Black", "Brushed Gold"], "Widespread"],
    ["Ridge", 395, null, ["Chrome", "Matte Black"], "Wall-Mount"],
    ["Brook", 165, null, ["Chrome", "Brushed Nickel"], "Single-Hole"],
  ],
  Mirrors: [
    ["Halo LED", 320, [30, 36, 42], null, "LED"],
    ["Frame Oak", 180, [24, 30], null, "Framed"],
    ["Edge", 140, [28, 36], null, "Frameless"],
  ],
  Toilets: [
    ["Meridian", 540, null, ["Single", "Dual"], "One-Piece"],
    ["Compact", 380, null, ["Single", "Dual"], "Two-Piece"],
    ["Summit Comfort", 620, null, ["Dual"], "One-Piece"],
  ],
};

const DESCRIPTIONS = {
  Vanities: (m) => `<p>The <strong>${m}</strong> vanity pairs a soft-close cabinet with a pre-drilled stone top and integrated basin. A clean, transitional profile that suits most bathrooms.</p>`,
  Faucets: (m) => `<p>The <strong>${m}</strong> faucet is a solid-brass fixture with a ceramic-disc cartridge rated for long service life. Lead-free and WaterSense-labeled.</p>`,
  Mirrors: (m) => `<p>The <strong>${m}</strong> mirror adds light and depth. Moisture-resistant backing; ready for vertical or horizontal mounting.</p>`,
  Toilets: (m) => `<p>The <strong>${m}</strong> toilet offers a powerful, efficient flush and an easy-clean glazed trap. Comfort-height bowl.</p>`,
};

let sourceIdSeq = 100000;

/** Build a product doc for Payload from a blueprint row. */
function buildProduct(category, [model, basePrice, sizes, choices, topOrMount], partnerId, categoryId) {
  const catSlug = slugify(category);
  const variants = [];
  const perVariant = [];
  const combos = [];

  const sizeList = sizes ?? [null];
  const choiceList = choices ?? [null];
  for (const size of sizeList) {
    for (const choice of choiceList) {
      // Price scales a little with size / option.
      const sizeBump = size ? (size - sizeList[0]) * 14 : 0;
      const customer = round((basePrice + sizeBump) * (choice === "Brushed Gold" ? 1.12 : 1));
      const skuBits = [model.replace(/\s+/g, "").slice(0, 4).toUpperCase(), size ?? "", (choice ?? "").slice(0, 2).toUpperCase()].filter(Boolean);
      const sku = skuBits.join("-");
      const optionValues = {};
      if (size != null) optionValues[category === "Vanities" || category === "Mirrors" ? "size" : "size"] = `${size} in`;
      if (choice != null) {
        const axis = category === "Vanities" ? "color" : category === "Faucets" ? "finish" : category === "Toilets" ? "flush" : "style";
        optionValues[axis] = choice;
      }
      combos.push({ sku, customer, size, choice, optionValues });
    }
  }

  for (const c of combos) {
    const itemPrice = round(c.customer / 2); // illustrative demo markup (× 2), not a real formula
    variants.push({
      sourceSku: c.sku,
      available: Math.random() > 0.08, // a few sold-out for realism
      sourcePrice: itemPrice,
      optionValues: c.optionValues,
      image: `/placeholders/${catSlug}.svg`,
    });
    perVariant.push({
      sku: c.sku, basis: "dealer", itemPrice, dealerPrice: itemPrice,
      retailPrice: round(itemPrice * 1.5), customerPrice: c.customer,
    });
  }

  const prices = combos.map((c) => c.customer);
  const startingAt = Math.min(...prices);

  // Product-level attributes (non-variant): top material / mount / style / type.
  const attributes = {};
  if (category === "Vanities") attributes.top_material = topOrMount;
  if (category === "Faucets") attributes.mount = topOrMount;
  if (category === "Mirrors") attributes.style = topOrMount;
  if (category === "Toilets") attributes.type = topOrMount;
  if (sizes) attributes.size = sizes.map((s) => `${s} in`);
  if (category === "Vanities") attributes.color = choices;
  if (category === "Faucets") attributes.finish = choices;

  const sourceId = String(sourceIdSeq++);
  return {
    partner: partnerId,
    category: categoryId,
    sourceId,
    sourceSku: combos[0].sku,
    sourceHandle: slugify(`${model}-${category}`),
    title: `${model} ${category === "Vanities" ? "Vanity" : category === "Faucets" ? "Faucet" : category === "Mirrors" ? "Mirror" : "Toilet"}`,
    slug: slugify(`${model}-${category}-${sourceId}`),
    descriptionHtml: DESCRIPTIONS[category](model),
    tags: [category.toLowerCase(), "artisan-bath"],
    attributes,
    variants,
    primaryImage: `/placeholders/${catSlug}.svg`,
    gallery: [`/placeholders/${catSlug}.svg`],
    sourceImageCount: 1,
    customerPriceStartingAt: startingAt,
    pricing: {
      model: "formula_v1",
      bowlCount: null,
      formula: { taxRate: 0, multiplier: 2, expression: "item × 2 (illustrative demo markup)" },
      basis: "dealer",
      perVariant,
      startingAt,
      priceRange: { low: Math.min(...prices), high: Math.max(...prices) },
      manualOverride: null,
      _status: "set",
    },
    status: "published",
  };
}

async function clearCollection(payload, slug) {
  const res = await payload.find({ collection: slug, limit: 1000, pagination: false, depth: 0 });
  for (const doc of res.docs) await payload.delete({ collection: slug, id: doc.id });
  return res.docs.length;
}

async function main() {
  if (!process.env.DATABASE_URI) { console.error("✖ DATABASE_URI not set — see .env.example"); process.exit(1); }
  const payload = await getPayload({ config });

  console.log("→ clearing existing catalog…");
  for (const slug of ["products", "attributeDefinitions", "categories", "partners"]) {
    const n = await clearCollection(payload, slug);
    console.log(`  cleared ${n} ${slug}`);
  }

  console.log("→ partner…");
  const partner = await payload.create({
    collection: "partners",
    data: { name: "Artisan Bath Co.", slug: "artisan-bath", sourceType: "shopify_json", sourceBase: "https://artisanbath.example", imageUsageApproved: true },
  });

  console.log("→ categories + attribute definitions…");
  const categoryId = {};
  let order = 0;
  for (const name of Object.keys(ATTR_DEFS)) {
    const cat = await payload.create({ collection: "categories", data: { name, slug: slugify(name), partner: partner.id, order: order++ } });
    categoryId[name] = cat.id;
    for (const def of ATTR_DEFS[name]) {
      await payload.create({
        collection: "attributeDefinitions",
        data: {
          key: def.key, label: def.label, category: cat.id, type: def.type,
          unit: def.unit ?? undefined,
          options: (def.options ?? []).map((value) => ({ value })),
          variantDefining: !!def.variantDefining, filterable: !!def.filterable, order: def.order,
        },
      });
    }
  }

  console.log("→ products…");
  let count = 0;
  for (const [category, rows] of Object.entries(BLUEPRINTS)) {
    for (const row of rows) {
      const data = buildProduct(category, row, partner.id, categoryId[category]);
      await payload.create({ collection: "products", data });
      count++;
    }
  }

  console.log(`\n✅ seeded: 1 partner, ${Object.keys(ATTR_DEFS).length} categories, ${count} products.`);
  console.log("   open /admin to manage them, or the storefront to browse.");
  process.exit(0);
}

main().catch((err) => { console.error("✖ seed failed:", err); process.exit(1); });
