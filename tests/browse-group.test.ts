// Browse-tile grouping — collapse a split size-ladder into ONE tile (rebuild, 2026-08-13).
//
// WHY THIS EXISTS / WHY v1 WAS REVERTED. When Artisan Bath Co. splits a line into one product per
// size, the browse grid shows N tiles for what is conceptually one product. v1 collapsed them
// by grouping on `parseSku().family` — but a family key is NOT the set the product page can
// navigate. It grouped models with no configurator (dead-end tiles), collapsed multi-axis CVG
// families whose size buttons don't reach every member, and counted 3 finishes of a one-size
// product as "3 sizes". The rebuild decides collapse by the SAME reachability engine the page
// uses (`buildConfigurator`): a family collapses ONLY if the cheapest member's SIZE axis reaches
// EVERY visible member. These tests pin each of those failure modes as an explicit non-collapse.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeBrowseGroups,
  applyBrowseGroups,
  buildConfigurator,
  productToItem,
} from "../lib/catalog-shared";
import { makeProduct, family } from "./fixtures";
import type { Product } from "@/schema/types";

const cvk = (sku: string, price: number, color = "Driftwood Gray"): Product =>
  makeProduct({ sku, slug: sku.toLowerCase(), variants: [{ sku, price }], attributes: { color } });

// A clean size ladder: one colour (DG) + one handle (BN), five sizes. The exact family the
// feature targets — CVK/CVL/CVB/CVC per-size splits.
const CVK = [
  cvk("CVK30-DG-BN", 1500),
  cvk("CVK36-DG-BN", 1700),
  cvk("CVK42-DG-BN", 1900),
  cvk("CVK48-DG-BN", 2100),
  cvk("CVK72D-DG-BN", 3200, "White"),
];

// The modular CVB line takes its size from the TITLE, not the SKU (MODULAR_LINE_MODELS), so it
// must be built with real titles — this proves the title-driven ladder collapses too.
const titled = (sku: string, title: string, price: number): Product =>
  makeProduct({ sku, slug: sku.toLowerCase(), title, variants: [{ sku, price }] });
const CVB36 = [
  titled("CVB36-B", '36" Bathroom Vanity with White Ceramic Top and Mirrors CVB36', 2000),
  titled("CVB36-48B", '48" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-48', 2300),
  titled("CVB36-60B", '60" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-60', 2600),
  titled("CVB36-84B", '84" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-84', 3400),
];

describe("computeBrowseGroups — only provably-clean size ladders collapse", () => {
  test("a clean size ladder collapses to one group with the right size count", () => {
    const groups = computeBrowseGroups(CVK);
    assert.equal(groups.length, 1, "one family, one group");
    const g = groups[0];
    assert.equal(g.sizeCount, 5, "five sizes on the ladder");
    assert.equal(g.memberSlugs.length, 5, "all five members collapse into it");
  });

  test("the representative is the CHEAPEST member (truthful 'Starting at')", () => {
    const g = computeBrowseGroups(CVK)[0];
    assert.equal(g.representativeSlug, "cvk30-dg-bn", "the $1,500 30-inch, not a pricier size");
  });

  test("INVARIANT — the badge equals what the product page navigates, and no member is stranded", () => {
    // The whole point of the rebuild: badge count == the page's Size selector, and every
    // collapsed member is reachable FROM the representative (so nothing vanishes unreachably).
    const g = computeBrowseGroups(CVK)[0];
    const rep = CVK.find((p) => p.slug === g.representativeSlug)!;
    const sizeAxis = buildConfigurator(rep, CVK)!.axes.find((a) => a.key === "size")!;
    assert.equal(g.sizeCount, sizeAxis.options.length, "badge number == size-axis option count");
    const reachable = new Set(sizeAxis.options.map((o) => o.targetSlug));
    for (const slug of g.memberSlugs) assert.ok(reachable.has(slug), `${slug} must be reachable from the tile`);
  });

  test("the modular title-driven CVB line also collapses", () => {
    const groups = computeBrowseGroups(CVB36);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].sizeCount, 4, "36/48/60/84 — sparse by design, still one ladder");
  });
});

describe("computeBrowseGroups — multi-axis, colour-only, and non-configurator families", () => {
  test("multi-axis CVG splits into per-countertop navigable components, each a truthful ladder", () => {
    // Countertop is welded to size (marble on singles, black limestone on doubles), so from the
    // 60D you can only reach the other double by changing size alone. The family therefore breaks
    // into TWO fully-navigable components — the doubles (60D,72D) and the singles (36,48) — each
    // collapsing to one tile whose badge matches its own size selector. No member is stranded.
    const cvg = family(["CVG60D-T-BT", "CVG72D-T-BT", "CVG48-T-ET", "CVG36-T-ET"]);
    const groups = computeBrowseGroups(cvg);
    assert.equal(groups.length, 2, "one tile per navigable countertop group");
    for (const g of groups) assert.equal(g.sizeCount, 2, "each component offers two sizes");
    const collapsed = groups.flatMap((g) => g.memberSlugs).sort();
    assert.deepEqual(collapsed, cvg.map((p) => p.slug).sort(), "all four members represented, none stranded");
  });

  test("a component spanning two colours collapses to one tile; badge = the rep's own size count", () => {
    // Engineered-marble singles in Tan AND Light Wheat, sizes 36 & 48: one connected component
    // (size hops within a colour, colour hops within a size). Collapses to a single tile, and the
    // badge equals the representative's size selector — never a size the page can't actually show.
    const comp = family(["CVG36-T-ET", "CVG48-T-ET", "CVG36-LW-ET", "CVG48-LW-ET"]);
    const groups = computeBrowseGroups(comp);
    assert.equal(groups.length, 1, "two colours × two sizes = one navigable tile");
    assert.equal(groups[0].memberSlugs.length, 4, "all four collapse together");
    const rep = comp.find((p) => p.slug === groups[0].representativeSlug)!;
    const repSizes = buildConfigurator(rep, comp)!.axes.find((a) => a.key === "size")!.options.length;
    assert.equal(groups[0].sizeCount, repSizes, "badge == what the rep's page navigates");
  });

  test("a colour-only component (one size, several finishes) does NOT collapse — no size axis", () => {
    const colourOnly = family(["CVG60D-T-BT", "CVG60D-LW-BT"]); // same 60D size, two colours
    assert.deepEqual(computeBrowseGroups(colourOnly), [], "a colour axis is not a size ladder");
  });

  test("non-configurator models (LED mirrors) do NOT collapse — buildConfigurator returns null", () => {
    const mirrors = family(["VA50", "VA52", "VA23", "VA56", "VA7"]);
    assert.deepEqual(computeBrowseGroups(mirrors), [], "five unrelated mirrors are not a ladder");
  });

  test("hide_by_default members (base cabinets/add-ons) never collapse", () => {
    const hidden = ["CVK30-DG-BN", "CVK36-DG-BN"].map((sku) =>
      makeProduct({ sku, slug: sku.toLowerCase(), variants: [{ sku, price: 1000 }], attributes: { hide_by_default: true } }),
    );
    assert.deepEqual(computeBrowseGroups(hidden), [], "hidden units are their own tiles behind the toggle");
  });

  test("a lone product (no siblings) does NOT collapse", () => {
    assert.deepEqual(computeBrowseGroups([cvk("CVK30-DG-BN", 1500)]), []);
  });
});

describe("applyBrowseGroups — the collapse transform", () => {
  const groups = computeBrowseGroups(CVK);
  const items = CVK.map(productToItem);

  test("collapses N member tiles into ONE representative carrying the size count", () => {
    const out = applyBrowseGroups(items, groups);
    assert.equal(out.length, 1, "five tiles become one");
    assert.equal(out[0].slug, "cvk30-dg-bn");
    assert.equal(out[0].groupCount, 5);
  });

  test("the representative price is the LOWEST member price", () => {
    const out = applyBrowseGroups(items, groups);
    assert.equal(out[0].price, 1500);
  });

  test("member filter attributes are UNIONED so filtering by any finish still surfaces the tile", () => {
    const out = applyBrowseGroups(items, groups);
    const colour = out[0].attributes.color;
    const values = Array.isArray(colour) ? colour.map(String) : [String(colour)];
    assert.ok(values.includes("Driftwood Gray") && values.includes("White"), "both finishes present");
  });

  test("ungrouped items pass through untouched; nothing is dropped without a group", () => {
    const loner = productToItem(cvk("CVE20-SG", 999));
    const out = applyBrowseGroups([...items, loner], groups);
    assert.ok(out.find((i) => i.slug === "cve20-sg"), "a product outside any group survives");
    assert.equal(out.find((i) => i.slug === "cve20-sg")!.groupCount, undefined, "and carries no badge");
  });

  test("no groups → items returned unchanged", () => {
    assert.equal(applyBrowseGroups(items, []), items);
  });
});
