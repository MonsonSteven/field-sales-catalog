// CVL and CVF per-size lines — Artisan Bath Co.'s 2026-08-10 split (the fourth in five days).
//
// Same story as CVB/CVC: one listing with a size axis becomes one product per size. Two
// families needed new grammar, and each carried a distinct trap.
//
// ⚠ CVL — THE CONFIDENTLY-WRONG ONE. the supplier glues a sink marker onto the colour code, but only
// on sizes sold both ways:
//       CVL60-DDG-MB = Double + Driftwood Gray      CVL60-SDG-MB = Single + Driftwood Gray
//       CVL60-DG-MB  = Double + GRAY (not Driftwood)   CVL60-SG-MB = Single + Gray
// The old parse read those as colours literally named "Ddg" and "Sdg", and reported the
// double as single. Caught BEFORE publishing, which is the whole value of the cron failing
// closed rather than writing.
//
// ⚠ CVF — TWO FAMILIES ON PURPOSE. `WF` is a countertop, `WL` is WALL HUNG. Steven checked
// the supplier's live site: near-identical products, completely different installation. They must not
// share a size row, or tapping "48 in" silently changes what the customer is buying.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSku, buildConfigurator, modelOfFamily, MIXED_SELECTOR_MODELS } from "../lib/catalog-shared";
import type { Product } from "@/schema/types";

const prod = (sourceSku: string, title: string, attributes: Record<string, unknown> = {}): Product =>
  ({
    sourceSku, title, slug: sourceSku.toLowerCase(), category: "Vanities", attributes,
    variants: [{ sourceSku, available: true, optionValues: { color: "Driftwood Gray" } }],
    images: { primary: null, gallery: [] }, pricing: {}, tags: [],
  }) as unknown as Product;

const SINGLE = { sink: "With Sink", sink_config: "Single" };
const DOUBLE = { sink: "With Sink", sink_config: "Double" };
const NOSINK = { sink: "Base (No Sink)" };

describe("CVL — the sink marker glued to the colour code", () => {
  test("colour is NULL, never the prefixed code (this is the bug that was caught)", () => {
    for (const [sku, t, a] of [
      ["CVL60-DDG-MB", '60" Double Sink Freestanding Bathroom Vanity', DOUBLE],
      ["CVL60-SDG-MB", '60" Single Sink Freestanding Bathroom Vanity', SINGLE],
      ["CVL20-DG-MB", '20" Freestanding Bathroom Vanity', SINGLE],
    ] as const) {
      const p = parseSku(sku, prod(sku, t, a));
      assert.equal(p?.color, null, `${sku} must expose no cross-product colour`);
    }
  });

  test("sink comes from the ATTRIBUTES, because the title is silent on most of them", () => {
    // CVL72-DDG-MB is the case that decides the design: a DOUBLE whose title never says so.
    // Reading the title first would have mislabelled it, and it would have looked fine.
    const p = parseSku("CVL72-DDG-MB", prod("CVL72-DDG-MB", '72" Freestanding Bathroom Vanity', DOUBLE));
    assert.equal(p?.sink, "double");
    const s = parseSku("CVL20-DG-MB", prod("CVL20-DG-MB", '20" Freestanding Bathroom Vanity', SINGLE));
    assert.equal(s?.sink, "single");
  });

  test("THE DISCRIMINATOR: the old multi-size parents are left alone", () => {
    // CVL20-DG-BN is still PUBLISHED with 54 native variants and works today. Its SKU is
    // structurally identical to the new per-size ones — only the title differs (no leading
    // size). It must keep its existing parse, colour and all.
    const parent = parseSku("CVL20-DG-BN", prod("CVL20-DG-BN", "Freestanding Bathroom Vanity With Assembled Sink", SINGLE));
    assert.equal(parent?.family, "CVL", "the parent keeps the plain family");
    assert.equal(parent?.color, "Driftwood Gray", "and keeps its cross-product colour");
    // …while its split sibling takes the new branch.
    const split = parseSku("CVL20-DG-MB", prod("CVL20-DG-MB", '20" Freestanding Bathroom Vanity', SINGLE));
    assert.equal(split?.family, "CVL-MB");
    assert.equal(split?.color, null);
  });

  test("the family key still reduces to CVL, so mixed mode applies", () => {
    assert.equal(modelOfFamily("CVL-MB"), "CVL");
    assert.ok(MIXED_SELECTOR_MODELS.has(modelOfFamily("CVL-MB")));
  });

  test("a SKU/title size conflict is refused rather than guessed", () => {
    assert.equal(parseSku("CVL60-DDG-MB", prod("CVL60-DDG-MB", '48" Freestanding Bathroom Vanity', DOUBLE)), null);
  });
});

describe("CVF — countertop and wall-hung are separate lines", () => {
  const wf = (s: string, t: string, a = SINGLE) => parseSku(s, prod(s, t, a));

  test("WF and WL never share a family", () => {
    const a = wf("CVF48WF", '48" Single Sink Bathroom Vanity Top in White Resin');
    const b = wf("CVF48WL", '48" Single Sink Bathroom Wall Hung Vanity Top in White Resin');
    assert.equal(a?.family, "CVF-WF");
    assert.equal(b?.family, "CVF-WL");
    assert.notEqual(a?.family, b?.family, "a rep must not switch mounting by tapping a size");
  });

  test("the D marker and the attributes agree on doubles", () => {
    assert.equal(wf("CVF60DWF", '60" Double Sink Bathroom Vanity Top', DOUBLE)?.sink, "double");
    assert.equal(wf("CVF60WF", '60" Single Sink Bathroom Vanity Top', SINGLE)?.sink, "single");
  });

  test("the sink-less 11 inch filler top carries no sink label", () => {
    // `base` maps to null: ParsedSku.sink exists to LABEL a size button, and "no sink" has
    // no label to add. The real base/single/double answer for pricing lives in PER_SIZE_BOWL.
    const p = wf("CVF11WL", '11" Bathroom Wall Hung Vanity Top in White Resin', NOSINK);
    assert.equal(p?.size, 11);
    assert.equal(p?.sink, null);
  });

  test("colour is never an axis — every unit is White Resin", () => {
    assert.equal(wf("CVF30WL", '30" Single Sink Bathroom Wall Hung Vanity Top')?.color, null);
  });

  test("the retired multi-size parents parse to null", () => {
    // Their titles carry no leading size, so they keep their native selector and don't
    // pollute the new families.
    assert.equal(wf("CVF60WF", "Bathroom Vanity Top in White Resin CVF WF"), null);
    assert.equal(wf("CVF60WL", "Bathroom Wall Hung Vanity Top in White Resin CVF", NOSINK), null);
  });

  test("a SKU/title size conflict is refused", () => {
    assert.equal(wf("CVF60DWF", '48" Double Sink Bathroom Vanity Top', DOUBLE), null);
  });
});

describe("buildConfigurator — the ladders these produce", () => {
  const CVL_MB = [
    prod("CVL20-DG-MB", '20" Freestanding Bathroom Vanity', SINGLE),
    prod("CVL48-DG-MB", '48" Freestanding Bathroom Vanity', SINGLE),
    prod("CVL60-SDG-MB", '60" Single Sink Freestanding Bathroom Vanity', SINGLE),
    prod("CVL60-DDG-MB", '60" Double Sink Freestanding Bathroom Vanity', DOUBLE),
    prod("CVL72-DDG-MB", '72" Freestanding Bathroom Vanity', DOUBLE),
  ];
  const CVF_ALL = [
    prod("CVF24WF", '24" Single Sink Bathroom Vanity Top', SINGLE),
    prod("CVF60DWF", '60" Double Sink Bathroom Vanity Top', DOUBLE),
    prod("CVF11WL", '11" Bathroom Wall Hung Vanity Top', NOSINK),
    prod("CVF24WL", '24" Single Sink Bathroom Wall Hung Vanity Top', SINGLE),
  ];
  const sizes = (p: Product, all: Product[]) =>
    buildConfigurator(p, all)?.axes.find((a) => a.key === "size")?.options.map((o) => o.label) ?? null;

  test("CVL-MB distinguishes the two 60-inch units", () => {
    // 60 exists as BOTH a single and a double. If sink were dropped they'd collide and one
    // would vanish from the row.
    const row = sizes(CVL_MB[0], CVL_MB)!;
    assert.ok(row.includes("60 in"), "the single 60 must be reachable");
    assert.ok(row.includes("60 in + Double Sink"), "and so must the double");
    assert.equal(new Set(row).size, row.length, "no duplicate size buttons");
  });

  test("CVF families do not see each other's sizes", () => {
    const wfRow = sizes(CVF_ALL[0], CVF_ALL)!;
    const wlRow = sizes(CVF_ALL[2], CVF_ALL)!;
    assert.ok(!wfRow.includes("11 in"), "11 in is wall-hung only");
    assert.ok(wlRow.includes("11 in"));
    assert.ok(!wlRow.includes("60 in + Double Sink") || !wfRow.includes("11 in"));
  });
});
