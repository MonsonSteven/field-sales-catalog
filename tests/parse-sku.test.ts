// parseSku — the SKU grammar every configurator axis is derived from. If this drifts,
// every button row on every vanity/cabinet page drifts with it.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSku } from "../lib/catalog-shared";

describe("parseSku — vanity grammar [MODEL][SIZE][D|S?]-[COLOR]-[TOP?]", () => {
  test("double sink + colour + top", () => {
    const p = parseSku("CVG60D-T-BT");
    assert.equal(p?.model, "CVG");
    assert.equal(p?.family, "CVG");
    assert.equal(p?.size, 60);
    assert.equal(p?.sink, "double");
    assert.equal(p?.color, "Tan");
    assert.equal(p?.top, "Black Limestone");
    assert.equal(p?.handle, null);
  });

  test("implicit single (no trailing letter)", () => {
    assert.equal(parseSku("CVG48-T-ET")?.sink, "single");
  });

  test("explicit single (trailing S) — the the supplier inconsistency", () => {
    const p = parseSku("CVG60S-T-ET");
    assert.equal(p?.sink, "single");
    assert.equal(p?.size, 60);
    // singles and doubles must fold into ONE family so the size row spans both
    assert.equal(p?.family, parseSku("CVG60D-T-BT")?.family);
  });

  test("colour tokens map to human labels", () => {
    assert.equal(parseSku("CVK72D-DG-BN")?.color, "Driftwood Gray");
    assert.equal(parseSku("CVE60D-SG")?.color, "Silver Gray");
    assert.equal(parseSku("CVH54D-NO")?.color, "Natural Oak");
  });

  test("handle finish is read from a later segment", () => {
    assert.equal(parseSku("CVK72D-DG-BN")?.handle, "Brushed Nickel");
  });

  test("unknown colour token falls back to title case, never a raw code", () => {
    const p = parseSku("CVG60D-ZZZ");
    assert.equal(p?.color, "Zzz");
  });
});

describe("parseSku — CVD drawer cabinets ([drawers][L|R?]BROWN, not a colour)", () => {
  test("no prefix = two-drawer", () => {
    const p = parseSku("CVD24-BROWN");
    assert.equal(p?.drawers, 2);
    assert.equal(p?.color, "Brown");
    assert.equal(p?.size, 24);
  });

  test("numeric prefix = drawer count", () => {
    assert.equal(parseSku("CVD12-1BROWN")?.drawers, 1);
    assert.equal(parseSku("CVD15-3BROWN")?.drawers, 3);
  });

  test("orientation-suffixed units are kit-only components → excluded", () => {
    assert.equal(parseSku("CVD36-2LBROWN"), null);
    assert.equal(parseSku("CVD36-2RBROWN"), null);
  });

  test("unexpected CVD coding is rejected rather than guessed", () => {
    assert.equal(parseSku("CVD24-TEAL"), null);
  });
});

describe("parseSku — cabinet grammar [MODEL]-[SUBTYPE]-[COLOR]-[HANDLE]", () => {
  test("subtype is part of the family key (TC and LC are different products)", () => {
    const lc = parseSku("CVI-LC-DG-BN");
    const tc = parseSku("CVI-TC-DG-BN");
    assert.equal(lc?.family, "CVI-LC");
    assert.equal(tc?.family, "CVI-TC");
    assert.notEqual(lc?.family, tc?.family);
    assert.equal(lc?.color, "Driftwood Gray");
    assert.equal(lc?.handle, "Brushed Nickel");
    assert.equal(lc?.size, null); // no size axis on these
  });

  test("loose handle accessories are not a cabinet family", () => {
    assert.equal(parseSku("CVL-HANDLE-BN-1#"), null);
    assert.equal(parseSku("CVI-HANDLE-MB-1#"), null);
  });
});

describe("parseSku — rejects what it should", () => {
  test("composite kit SKUs (contain +) are never configurable", () => {
    assert.equal(parseSku("CVD12-1BROWN+24-BROWN"), null);
    assert.equal(parseSku("CVJ12-3B+36-2LB"), null);
  });

  test("null / empty / whitespace", () => {
    assert.equal(parseSku(null), null);
    assert.equal(parseSku(undefined), null);
    assert.equal(parseSku(""), null);
    assert.equal(parseSku("   "), null);
  });

  test("case and separator tolerance", () => {
    assert.equal(parseSku("cvg60d-t-bt")?.model, "CVG");
    assert.equal(parseSku("CVG60D_T_BT")?.top, "Black Limestone");
  });
});
