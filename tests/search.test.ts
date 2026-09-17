// Free-text search — name/SKU + ATTRIBUTES + unit-normalization (2026-09-02).
//
// WHY THIS EXISTS. A rep searched "96\"" in Vanities and got nothing, though 96-inch vanities
// exist. Two causes, both pinned below:
//   1. Search matched title + SKU only, never attribute values, and didn't unify `96"` vs
//      `96 inch` vs `96`.
//   2. Since the 2026-08-14 browse grouping, a split size-ladder collapses into ONE tile repped
//      by its CHEAPEST (smallest) size — so a 96" size sits behind a tile titled `24" …`, and
//      the size lives in each member's TITLE, not an attribute. The fix folds every member's
//      title into the tile's search haystack (applyBrowseGroups), so the tile is findable by any
//      size it offers. These tests hold that fix in place.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSearchText,
  buildSearchText,
  itemSearchText,
  itemMatchesQuery,
  searchItems,
  computeBrowseGroups,
  applyBrowseGroups,
  productToItem,
} from "../lib/catalog-shared";
import { makeProduct } from "./fixtures";
import type { Product } from "@/schema/types";
import type { CatalogItem } from "../lib/helpers";

describe("normalizeSearchText — number+unit spellings unify", () => {
  test('96", 96”, 96″, 96in, 96 inch, 96 inches and bare 96 all reduce to a token with "96"', () => {
    for (const form of ['96"', "96”", "96″", "96in", "96 inch", "96 inches", "96"]) {
      assert.ok(normalizeSearchText(form).includes("96"), `${form} should normalize to include 96`);
    }
  });

  test('a WxDxH title keeps every number findable ("96\\"x22\\"x34\\"" → 96, 22, 34)', () => {
    const n = normalizeSearchText('96"x22"x34" vanity');
    for (const d of ["96", "22", "34"]) assert.ok(n.includes(d), `${d} should survive normalization`);
  });

  test("lowercases and does not invent digits", () => {
    assert.equal(normalizeSearchText("Driftwood GRAY"), "driftwood gray");
    assert.ok(!normalizeSearchText("white vanity").includes("96"));
  });
});

describe("buildSearchText / itemSearchText — attributes are searchable", () => {
  const item: CatalogItem = {
    slug: "cvk30", title: "30 in Vanity", category: "Vanities", sku: "CVK30-DG-BN",
    image: null, tags: ["freestanding"], price: 1500, priceLow: null, priceHigh: null,
    attributes: { color: "Driftwood Gray", sink_config: ["Single", "Double"], size: "30 inch" },
  };

  test("the haystack includes SKU, tags and every attribute value", () => {
    const h = itemSearchText(item);
    for (const frag of ["cvk30", "freestanding", "driftwood", "single", "double", "30"]) {
      assert.ok(h.includes(frag), `haystack should include "${frag}"`);
    }
  });

  test("array-valued attributes (mixed sink) are flattened, not stringified as [object]", () => {
    assert.ok(!itemSearchText(item).includes("object"));
  });

  test("buildSearchText matches itemSearchText when no precomputed searchText", () => {
    assert.equal(itemSearchText(item), buildSearchText(item.title, item.sku, item.tags, item.attributes));
  });
});

describe("itemMatchesQuery — plain items", () => {
  const item: CatalogItem = {
    slug: "va50", title: '96" Bathroom Vanity with White Marble Top', category: "Vanities",
    sku: "CVC36-96B", image: null, tags: [], price: 6000, priceLow: null, priceHigh: null,
    attributes: { color: "White" },
  };
  test('finds a 96" product by 96, 96" and "96 inch"', () => {
    for (const q of ["96", '96"', "96 inch"]) assert.ok(itemMatchesQuery(item, q), `query "${q}" should match`);
  });
  test("finds by colour attribute", () => assert.ok(itemMatchesQuery(item, "white")));
  test("finds by SKU", () => assert.ok(itemMatchesQuery(item, "cvc36")));
  test("does not match an absent size", () => assert.ok(!itemMatchesQuery(item, "50")));
  test("an empty query matches everything (callers gate whether to search)", () => {
    assert.ok(itemMatchesQuery(item, "   "));
  });
});

// The reported bug, end to end: a split size-ladder whose sizes live in the TITLE.
const titled = (sku: string, title: string, price: number): Product =>
  makeProduct({ sku, slug: sku.toLowerCase(), title, variants: [{ sku, price }] });
const CVB36 = [
  titled("CVB36-B", '36" Bathroom Vanity with White Ceramic Top and Mirrors CVB36', 2000),
  titled("CVB36-48B", '48" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-48', 2300),
  titled("CVB36-60B", '60" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-60', 2600),
  titled("CVB36-96B", '96" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-96', 4200),
];

describe("collapsed size-ladder tile is findable by ANY size it offers (the reported bug)", () => {
  const items = CVB36.map(productToItem);
  const grouped = applyBrowseGroups(items, computeBrowseGroups(CVB36));

  test("the ladder collapses to one representative tile (the cheapest, 36\")", () => {
    assert.equal(grouped.length, 1, "one tile for the whole ladder");
    assert.ok(grouped[0].title.startsWith("36"), "represented by the cheapest 36-inch member");
    assert.ok((grouped[0].groupCount ?? 0) >= 2, "badged as a multi-size group");
  });

  test('searching "96" / "96\\"" / "96 inch" finds the tile even though its title says 36"', () => {
    for (const q of ["96", '96"', "96 inch"]) {
      assert.ok(itemMatchesQuery(grouped[0], q), `query "${q}" should reach the 96" member behind the tile`);
    }
  });

  test("every ladder size is reachable, and a size NOT on the ladder is not", () => {
    for (const q of ["36", "48", "60", "96"]) assert.ok(itemMatchesQuery(grouped[0], q), `${q} on ladder`);
    assert.ok(!itemMatchesQuery(grouped[0], "72"), "72 is not a member — must not match");
  });

  test("REGRESSION: title-only search (the old behaviour) would have missed 96 here", () => {
    // Proves the test targets the real gap: the tile's own title carries only 36.
    assert.ok(!normalizeSearchText(grouped[0].title).includes("96"));
  });
});

describe("searchItems (global/offline) — per-product, unit-normalized, attribute-aware", () => {
  test('finds a 96" product by "96" and "96\\""', () => {
    for (const q of ["96", '96"']) {
      const r = searchItems(CVB36, q);
      assert.ok(r.some((it) => it.sku === "CVB36-96B"), `"${q}" should surface the 96-inch product`);
    }
  });
  test("cheapest-first ordering is preserved", () => {
    const r = searchItems(CVB36, "vanity");
    const prices = r.map((it) => it.price ?? Infinity);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  });
  test("empty query returns nothing", () => assert.deepEqual(searchItems(CVB36, "   "), []));
});

describe("search excludes hide_by_default base cabinets (the topless-cabinet fix, 2026-09)", () => {
  // A colour search was surfacing bare "Cabinet Without Sink" units on the global search page.
  // They're filtered from the browse; now from search too — reps must never discover them.
  const grayCabinet = makeProduct({
    sku: "CVJ36-2LGRAY", slug: "cvj36-2lgray",
    title: "36 x 21 x 32.5 In. Two-Drawer Vanity Cabinet Without Sink",
    variants: [{ sku: "CVJ36-2LGRAY", price: 600 }],
    attributes: { color: "Gray", hide_by_default: true },
  });
  const grayVanity = makeProduct({
    sku: "CVK36-G-BN", slug: "cvk36-g-bn", title: '36" Gray Vanity with Stone Top',
    variants: [{ sku: "CVK36-G-BN", price: 1800 }], attributes: { color: "Gray" },
  });

  test('searching "gray" returns the complete vanity but NOT the base cabinet', () => {
    const skus = searchItems([grayCabinet, grayVanity], "gray").map((it) => it.sku);
    assert.ok(skus.includes("CVK36-G-BN"), "the real vanity is found");
    assert.ok(!skus.includes("CVJ36-2LGRAY"), "the topless base cabinet is excluded");
  });

  test('the string form hide_by_default:"true" is excluded too', () => {
    const strFlag = makeProduct({
      sku: "CVJ24-BROWN", slug: "cvj24-brown", title: "24 in Cabinet Without Sink",
      variants: [{ sku: "CVJ24-BROWN", price: 500 }], attributes: { hide_by_default: "true" },
    });
    assert.deepEqual(searchItems([strFlag], "cabinet"), []);
  });
});
