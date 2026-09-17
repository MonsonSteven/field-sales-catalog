// parseVanityDimensions — surface the supplier's real depth/height, never guess (2026-09-02).
//
// the supplier has no structured dimension field; it states W×D×H only in prose, for ~2/3 of vanities, in
// two shapes (verified across all 174 published vanities). The parser surfaces a number only when
// the supplier clearly states one AND it is a plausible vanity dimension — otherwise the page shows a hedged
// standard note. The sanity bounds are load-bearing: they reject the linen/tall cabinets that sit
// in the Vanities category but are not complete vanities, so "Height 72\"" never shows on a vanity.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseVanityDimensions, lookupVanityDimensions } from "../lib/catalog-shared";
import { VANITY_DIMENSIONS } from "../lib/vanity-dimensions.data";

describe("parseVanityDimensions", () => {
  test('format A — labelled "…Width 84" Depth 22" Height 34" Cabinet Material…"', () => {
    const d = parseVanityDimensions('...Bathroom Vanities Specifications Width 84" Depth 22" Height 34" Cabinet Material Solid Wood...');
    assert.deepEqual(d, { depth: 22, height: 34 });
  });

  test('format B — "…30 inches width x 18.3 inches depth x 34.5 inches height…"', () => {
    const d = parseVanityDimensions("DIMENSIONS: Vanity 30 inches width x 18.3 inches depth x 34.5 inches height; Basin ...");
    assert.deepEqual(d, { depth: 18.3, height: 34.5 });
  });

  test('depth-only description yields depth, null height (real case: "Width 60" Depth 22" Cabinet…")', () => {
    const d = parseVanityDimensions('...Specifications Width 60" Depth 22" Cabinet Material Solid Wood Countertop Engineered Stone...');
    assert.deepEqual(d, { depth: 22, height: null });
  });

  test("strips HTML tags and entities before parsing", () => {
    const d = parseVanityDimensions("<p>Width 48&quot; <b>Depth 22&quot;</b> Height 38&quot;</p>");
    assert.deepEqual(d, { depth: 22, height: 38 });
  });

  test("SANITY BOUNDS: a 72\" linen cabinet height is rejected (not a vanity dimension)", () => {
    // CVI-LC/CVL-LC linen towers live in Vanities but are 72" tall / 8" deep — must not surface.
    const d = parseVanityDimensions('...Linen Cabinet Width 21" Depth 8" Height 72"...');
    assert.deepEqual(d, { depth: null, height: null }, "8\" depth and 72\" height are both out of bounds");
  });

  test("no dimensions in the text → both null (page falls back to the hedged note)", () => {
    assert.deepEqual(parseVanityDimensions("A beautiful freestanding vanity with a stone top."), {
      depth: null,
      height: null,
    });
  });

  test("null/empty input is safe", () => {
    assert.deepEqual(parseVanityDimensions(null), { depth: null, height: null });
    assert.deepEqual(parseVanityDimensions(""), { depth: null, height: null });
  });
});

// lookupVanityDimensions — authoritative per-size W×D×H from the supplier's "3D spec" sheets (2026-09-11).
// The upgrade over prose parsing: exact numbers for the selected size, keyed by the model in the
// SKU. Absent model → null → the caller falls back to parseVanityDimensions' prose/hedged note.
describe("lookupVanityDimensions", () => {
  test("exact model match returns overall W×D×H", () => {
    assert.deepEqual(lookupVanityDimensions("CVI36-VG-BN"), { w: 36, d: 22, h: 38 });
  });

  test("small sizes keep their real decimals (never rounded)", () => {
    assert.deepEqual(lookupVanityDimensions("CVL20-DG-BN"), { w: 20.2, d: 15.6, h: 34.1 });
    assert.deepEqual(lookupVanityDimensions("CVI24-W-MB"), { w: 24.1, d: 18.3, h: 34.2 });
  });

  test("explicit double (D) and single (S) suffixes resolve to the same 60\" cabinet", () => {
    assert.deepEqual(lookupVanityDimensions("CVE60D-SG"), { w: 60, d: 22, h: 38 });
    assert.deepEqual(lookupVanityDimensions("CVE60S-VG"), { w: 60, d: 22, h: 38 });
  });

  test('bare-60 SKU (the "CVL60-DG = 60" Double, Gray" gotcha) still resolves via …D/…S', () => {
    // The D rides the COLOUR segment, so the size has no D/S — but a 60" cabinet is 60" either way.
    assert.deepEqual(lookupVanityDimensions("CVL60-DG-BN"), { w: 60, d: 22, h: 38 });
    assert.deepEqual(lookupVanityDimensions("CVL60-DDG-BN"), { w: 60, d: 22, h: 38 });
  });

  test("linen/tall cabinet subtypes (-LC/-TC) resolve by their token, not a size", () => {
    assert.deepEqual(lookupVanityDimensions("CVI-LC-DG-BN"), { w: 21, d: 17, h: 72 });
    assert.deepEqual(lookupVanityDimensions("CVL-TC-DG-BN"), { w: 24, d: 8, h: 33 });
  });

  test("CVM1148 glued-serial typo aliases to the real 48\" (matches the pricing layer)", () => {
    assert.deepEqual(lookupVanityDimensions("CVM1148-T-ET"), { w: 48, d: 22, h: 38 });
  });

  test("case-insensitive", () => {
    assert.deepEqual(lookupVanityDimensions("cvi36-vg-bn"), { w: 36, d: 22, h: 38 });
  });

  test("un-decoded the supplier#### renames (CVA/CVB/CVC/CVF) return null → caller falls back", () => {
    assert.equal(lookupVanityDimensions("CVC36-B"), null);
    assert.equal(lookupVanityDimensions("CVB36-108B"), null);
    assert.equal(lookupVanityDimensions("CVF48-W"), null);
  });

  test("edge size with no sheet page (CVL84D — sheet stops at 72\") returns null", () => {
    assert.equal(lookupVanityDimensions("CVL84D-NO-MB"), null);
  });

  test("non-vanity SKUs and junk are null-safe", () => {
    assert.equal(lookupVanityDimensions("BS222PW"), null);
    assert.equal(lookupVanityDimensions("SH-something"), null);
    assert.equal(lookupVanityDimensions(null), null);
    assert.equal(lookupVanityDimensions(""), null);
  });
});

// Data-file integrity guard — a wrong regen or an accidental edit shows up here loudly.
describe("VANITY_DIMENSIONS data file", () => {
  test("covers exactly the 7 rep-facing lines (no CVN, no other lines)", () => {
    const lines = new Set(Object.keys(VANITY_DIMENSIONS).map((k) => (k.match(/^(CV[A-Z])/) || [])[1]));
    assert.deepEqual([...lines].sort(), ["CVE", "CVG", "CVH", "CVI", "CVK", "CVL", "CVM"]);
  });

  test("every entry is a sane vanity/cabinet envelope in inches", () => {
    for (const [model, d] of Object.entries(VANITY_DIMENSIONS)) {
      assert.ok(d.w >= 8 && d.w <= 96, `${model} width ${d.w}`);
      assert.ok(d.d >= 6 && d.d <= 30, `${model} depth ${d.d}`);
      assert.ok(d.h >= 20 && d.h <= 84, `${model} height ${d.h}`);
    }
  });
});
