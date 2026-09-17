// buildConfigurator — the CROSS-LINK button rows (navigate between sibling products).
// The behaviour these tests pin was decided on 2026-07-31 after Steven found buttons that
// silently jumped to an unrelated variant: an axis value renders ONLY when a sibling exists
// that changes THAT ONE AXIS ALONE. Loosening this reintroduces the jump bug.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildConfigurator, filterDefsForCategory, parseSku } from "../lib/catalog-shared";
import { makeProduct, family } from "./fixtures";

const axis = (cfg: any, key: string) => cfg?.axes.find((a: any) => a.key === key);
const labels = (cfg: any, key: string) => axis(cfg, key)?.options.map((o: any) => o.label) ?? [];

describe("buildConfigurator — strict one-axis-change resolution", () => {
  test("REGRESSION (the CVG top-jump): an axis whose values are welded to another axis is dropped", () => {
    // Tan family where black limestone exists only on DOUBLES and marble only on SINGLES.
    // From the 60in double, 'Engineered Marble' is NOT reachable by changing top alone, so
    // the Top row must not render at all (previously it rendered and jumped to a size).
    const all = family(["CVG60D-T-BT", "CVG72D-T-BT", "CVG48-T-ET", "CVG36-T-ET"]);
    const cfg = buildConfigurator(all[0], all);
    assert.equal(axis(cfg, "top"), undefined, "Top row must be absent — marble is unreachable here");
    // and the size row only offers the sizes that exist in THIS configuration
    assert.deepEqual(labels(cfg, "size"), ["60 in + Double Sink", "72 in + Double Sink"]);
  });

  test("a fully-populated family keeps every size (no over-pruning)", () => {
    const skus = ["CVK30-DG-BN", "CVK36-DG-BN", "CVK42-DG-BN", "CVK48-DG-BN", "CVK72D-DG-BN"];
    const all = family(skus);
    const cfg = buildConfigurator(all[0], all);
    assert.equal(axis(cfg, "size")?.options.length, 5);
  });

  test("size options are sorted numerically, doubles notated in plain English", () => {
    const all = family(["CVE20-SG", "CVE72D-SG", "CVE36-SG"]);
    const cfg = buildConfigurator(all[0], all);
    assert.deepEqual(labels(cfg, "size"), ["20 in", "36 in", "72 in + Double Sink"]);
  });

  test("a reachable colour change renders (same size + top)", () => {
    const all = family(["CVG60D-T-BT", "CVG60D-LW-BT"]);
    const cfg = buildConfigurator(all[0], all);
    assert.deepEqual(labels(cfg, "color").sort(), ["Light Wheat", "Tan"]);
  });

  test("the selected option always renders and points at the current page", () => {
    const all = family(["CVE20-SG", "CVE36-SG"]);
    const cfg = buildConfigurator(all[0], all);
    const sel = axis(cfg, "size")?.options.find((o: any) => o.selected);
    assert.ok(sel, "there must always be a selected option");
    assert.equal(sel.targetSlug, all[0].slug);
  });
});

describe("buildConfigurator — scope guards", () => {
  test("a family with no siblings gets no configurator", () => {
    const only = makeProduct({ sku: "CVG60D-T-BT", variants: [{ sku: "CVG60D-T-BT" }] });
    assert.equal(buildConfigurator(only, [only]), null);
  });

  test("models outside the verified allowlist get no configurator", () => {
    // B* bathtubs / the supplier* mirrors don't follow this grammar — they keep native variants.
    const all = family(["B5151-BN", "B5172-BN", "B5221-BN"]);
    assert.equal(buildConfigurator(all[0], all), null);
  });

  test("kit SKUs are excluded even when siblings exist", () => {
    const all = family(["CVD12-1BROWN+24-BROWN", "CVD15-1BROWN+24-BROWN"]);
    assert.equal(buildConfigurator(all[0], all), null);
  });
});

describe("buildConfigurator — CVD drawer cabinets", () => {
  test("drawer count rides in the size label (it is fixed per size, not a real axis)", () => {
    const all = family(["CVD12-1BROWN", "CVD15-1BROWN", "CVD24-BROWN", "CVD30-BROWN"]);
    const cfg = buildConfigurator(all[0], all);
    assert.deepEqual(labels(cfg, "size"), [
      "12 in (1-Drawer)",
      "15 in (1-Drawer)",
      "24 in (2-Drawer)",
      "30 in (2-Drawer)",
    ]);
    // Brown is the only finish, so there must be no colour row
    assert.equal(axis(cfg, "color"), undefined);
  });
});

describe("buildConfigurator — sold-out surfacing", () => {
  test("an option whose target is fully sold out is marked, not hidden", () => {
    const a = makeProduct({ sku: "CVE20-SG", slug: "cve20", variants: [{ sku: "CVE20-SG", price: 1000 }] });
    const b = makeProduct({
      sku: "CVE36-SG",
      slug: "cve36",
      variants: [{ sku: "CVE36-SG", price: 1000, available: false }],
    });
    const cfg = buildConfigurator(a, [a, b]);
    const opt = axis(cfg, "size")?.options.find((o: any) => o.label === "36 in");
    assert.equal(opt.soldOut, true, "sold-out target must be flagged so reps see the real range");
  });
});

describe("filterDefsForCategory — dead-filter suppression", () => {
  const defs: any[] = [
    { key: "color", label: "Color", category: "Vanities", type: "enum", options: ["Gray", "White"], filterable: true, order: 1 },
    { key: "quanity", label: "Quantity", category: "Vanities", type: "enum", options: ["Single Sink", "Double Sink"], filterable: true, order: 2 },
    { key: "size", label: "Size", category: "Vanities", type: "number", options: [], filterable: true, order: 3 },
    { key: "series", label: "Series", category: "Vanities", type: "enum", options: ["CVG"], filterable: true, order: 4 },
  ];

  test("without items, every qualifying def is returned (back-compat)", () => {
    const keys = filterDefsForCategory(defs, "Vanities").map((f) => f.key);
    assert.deepEqual(keys, ["color", "quanity"]); // size is numeric, series has <2 options
  });

  test("REGRESSION: an orphaned def is dropped when no item carries its key", () => {
    // 'quanity' was renamed to 'style' on 2026-08-04, so no product carries it any more.
    // The def lingers (the sync never deletes) and would render a filter matching NOTHING.
    const items: { attributes: Record<string, string> }[] = [
      { attributes: { color: "Gray" } },
      { attributes: { color: "White" } },
    ];
    const keys = filterDefsForCategory(defs, "Vanities", items).map((f) => f.key);
    assert.deepEqual(keys, ["color"], "the dead 'Quantity' filter must not render");
  });

  test("a def stays as soon as ONE item carries it", () => {
    const items: { attributes: Record<string, string> }[] = [
      { attributes: { color: "Gray" } },
      { attributes: { quanity: "Single Sink" } },
    ];
    const keys = filterDefsForCategory(defs, "Vanities", items).map((f) => f.key);
    assert.deepEqual(keys, ["color", "quanity"]);
  });

  test("no items at all → no filters (rather than a rail of dead ones)", () => {
    assert.deepEqual(filterDefsForCategory(defs, "Vanities", []), []);
  });

  test("SLICE 2: the Accessories 'color' orphan is suppressed", () => {
    // Slice 2 remapped `overflow-bn`'s Color axis to `drain_finish`. It was the ONLY
    // Accessories product with a `color` axis, so after the re-sync the Accessories
    // `color` definition matches ZERO products — and `runSync` never deletes it. This is
    // the orphan the guard has to absorb; pinned here because it is a PREDICTED
    // consequence of Slice 2 rather than a hypothetical.
    const accDefs: any[] = [
      { key: "color", label: "Color", category: "Accessories", type: "enum", options: ["Brushed Nickel", "Matte Black"], filterable: true, order: 1 },
      { key: "drain_finish", label: "Drain & Overflow Finish", category: "Accessories", type: "enum", options: ["Brushed Nickel", "Integrated Overflow"], filterable: true, order: 2 },
      { key: "size", label: "Size", category: "Accessories", type: "enum", options: ["30 inch", "36 inch"], filterable: true, order: 3 },
    ];
    const items: { attributes: Record<string, string> }[] = [
      { attributes: { drain_finish: "Brushed Nickel" } }, // overflow-bn, post-rename
      { attributes: { size: "30 inch" } },                // a countertop
    ];
    const keys = filterDefsForCategory(accDefs, "Accessories", items).map((f) => f.key);
    assert.deepEqual(keys, ["drain_finish", "size"], "the orphaned 'Color' filter must not render");
  });

  test("SLICE 2: Bathtubs keeps BOTH color and drain_finish (not an orphan)", () => {
    // Unlike Accessories, Bathtubs `color` is still carried by the stone-resin BS* tubs,
    // so both filters are live and must render side by side.
    const btDefs: any[] = [
      { key: "color", label: "Color", category: "Bathtubs", type: "enum", options: ["Matte White", "Glossy White"], filterable: true, order: 1 },
      { key: "drain_finish", label: "Drain & Overflow Finish", category: "Bathtubs", type: "enum", options: ["Brushed Nickel", "Integrated Overflow"], filterable: true, order: 2 },
    ];
    const items: { attributes: Record<string, string> }[] = [
      { attributes: { color: "Matte White" } },              // BS* stone resin
      { attributes: { drain_finish: "Integrated Overflow" } }, // B* acrylic
    ];
    const keys = filterDefsForCategory(btDefs, "Bathtubs", items).map((f) => f.key);
    assert.deepEqual(keys, ["color", "drain_finish"]);
  });
});

describe("filterDefsForCategory — series denylist + dead-value pruning (2026-08-18)", () => {
  test("the `series` filter is kept out of the rail even with >=2 live options", () => {
    // series (CVM/CVG/CVL…) is internal the supplier jargon a rep/customer wouldn't recognise; pulled for the pilot.
    const defs: any[] = [
      { key: "color", label: "Color", category: "Vanities", type: "enum", options: ["Tan", "Light Wheat"], filterable: true, order: 1 },
      { key: "series", label: "Series", category: "Vanities", type: "enum", options: ["CVM", "CVG"], filterable: true, order: 2 },
    ];
    const items = [
      { attributes: { color: "Tan", series: "CVM" } },
      { attributes: { color: "Light Wheat", series: "CVG" } },
    ];
    assert.deepEqual(filterDefsForCategory(defs, "Vanities", items).map((f) => f.key), ["color"]);
  });

  test("the `sink` (Base/With Sink) facet is denylisted, but `sink_config` (Single/Double) is kept (2026-09-02)", () => {
    // Leadership pulled the Base (No Sink)/With Sink facet: base units are never shown to reps
    // anyway, so it only ever offered "With Sink". sink_config (Single vs Double) is different and
    // must survive. This pins that exactly — a one-character slip (denylisting "sink_config") would
    // silently kill a useful filter.
    const defs: any[] = [
      { key: "sink", label: "Sink", category: "Vanities", type: "enum", options: ["Base (No Sink)", "With Sink"], filterable: true, order: 1 },
      { key: "sink_config", label: "Sink Configuration", category: "Vanities", type: "enum", options: ["Single", "Double"], filterable: true, order: 2 },
    ];
    const items = [
      { attributes: { sink: "With Sink", sink_config: "Single" } },
      { attributes: { sink: "With Sink", sink_config: "Double" } },
    ];
    assert.deepEqual(filterDefsForCategory(defs, "Vanities", items).map((f) => f.key), ["sink_config"]);
  });

  test("dead VALUES are pruned so no option ever matches zero visible products", () => {
    // The 2026-08-18 bug: `size` offered 96/108 inch (retired parents) and 11 inch (a CVM1148
    // mis-parse) though no visible vanity had them. Toggling one showed 0 products.
    const defs: any[] = [
      { key: "size", label: "Size", category: "Vanities", type: "enum",
        options: ["36 inch", "48 inch", "96 inch", "108 inch", "11 inch"], filterable: true, order: 1 },
    ];
    const items = [{ attributes: { size: "36 inch" } }, { attributes: { size: "48 inch" } }];
    const f = filterDefsForCategory(defs, "Vanities", items);
    assert.deepEqual(f.map((x) => x.key), ["size"]);
    assert.deepEqual(f[0].options, ["36 inch", "48 inch"], "phantom sizes must not be offered");
  });

  test("a facet whose every defined value is dead is dropped entirely", () => {
    const defs: any[] = [
      { key: "size", label: "Size", category: "Vanities", type: "enum", options: ["96 inch", "108 inch"], filterable: true, order: 1 },
      { key: "color", label: "Color", category: "Vanities", type: "enum", options: ["Tan", "White"], filterable: true, order: 2 },
    ];
    const items = [{ attributes: { size: "36 inch", color: "Tan" } }, { attributes: { color: "White" } }];
    assert.deepEqual(filterDefsForCategory(defs, "Vanities", items).map((f) => f.key), ["color"]);
  });
});

describe("buildConfigurator — the mirror/accessory trap (Green-4 diagnostic, 2026-08-04)", () => {
  // Artisan Bath Co.'s LED-mirror SKUs are MODEL IDs, not sizes: VA50, VA52, VA23, VA56, VA7 are
  // five unrelated mirrors at $1,930–$2,884. The vanity grammar happily reads them as
  // family "the supplier" with sizes 50/52/23/56/7, so adding them to CONFIGURATOR_MODELS would paint
  // a nonsense size row grouping five different products. Their generic marketing titles
  // ("Frameless Square LED Light Bathroom Vanity Mirror in Clear") are identical too, so
  // title-grouping would over-merge in exactly the same way. The allowlist is the guard.
  test("mirror SKUs never receive a configurator, however parseable they look", () => {
    const mirrors = family(["VA50", "VA52", "VA23", "VA56", "VA7"]);
    for (const m of mirrors) {
      assert.equal(buildConfigurator(m, mirrors), null, `${m.sourceSku} must not get a configurator`);
    }
  });

  test("parseSku still parses them (the guard is the allowlist, not the parser)", () => {
    // Documenting the trap explicitly: the parse is "successful" but semantically wrong.
    const p = parseSku("VA50");
    assert.equal(p?.family, "VA");
    assert.equal(p?.size, 50, "50 is a model number misread as inches — hence the allowlist");
  });
});
