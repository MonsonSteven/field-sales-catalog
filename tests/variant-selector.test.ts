// buildVariantSelector / initialSelection / resolveVariant / selectAxisValue — the IN-PLACE
// picker (Slice 1) plus per-variant imagery (Slice 1c). This is the logic that resolves a
// click to a real variant on a SPARSE option space, so the failure mode it guards against is
// "clicking an option lands on a combination that doesn't exist".
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  orderGalleryForVariant,
  buildVariantSelector,
  initialSelection,
  resolveVariant,
  selectAxisValue,
  MIXED_SELECTOR_MODELS,
  NATIVE_WINS_AXES,
  modelOfFamily,
} from "../lib/catalog-shared";
import { makeProduct } from "./fixtures";

const axisKeys = (s: any) => s.axes.map((a: any) => a.key);
const valuesOf = (s: any, key: string) =>
  s.axes.find((a: any) => a.key === key)?.values.map((v: any) => v.value) ?? [];

describe("buildVariantSelector — what qualifies as a selector", () => {
  test("fewer than 2 priced variants → no selector (the price box already says it)", () => {
    const one = makeProduct({ sku: "X", variants: [{ sku: "X", price: 500 }] });
    assert.equal(buildVariantSelector(one), null);
  });

  test("unpriced variants are excluded from the selector", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { size: "20 inch" }, price: 100 },
        { sku: "B", opts: { size: "30 inch" }, price: null },
      ],
    });
    assert.equal(buildVariantSelector(p), null, "only 1 priced variant remains → no selector");
  });

  test("a single-valued option is not an axis (nothing to choose)", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { size: "20 inch", color: "Gray" }, price: 100 },
        { sku: "B", opts: { size: "30 inch", color: "Gray" }, price: 200 },
      ],
    });
    const s = buildVariantSelector(p)!;
    assert.deepEqual(axisKeys(s), ["size"]);
  });

  test("axis labels come from the attribute definitions when provided", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { handle_finish: "Brushed Nickel" }, price: 100 },
        { sku: "B", opts: { handle_finish: "Matte Black" }, price: 100 },
      ],
    });
    const s = buildVariantSelector(p, { handle_finish: "Handle Finish" })!;
    assert.equal(s.axes[0].label, "Handle Finish");
    // and falls back to a humanised key when there is no definition
    assert.equal(buildVariantSelector(p)!.axes[0].label, "Handle Finish");
  });

  test("a manual override collapses every variant to the authored price", () => {
    const p = makeProduct({
      sku: "X",
      manualOverride: 4242,
      variants: [
        { sku: "A", opts: { size: "20 inch" }, price: 100 },
        { sku: "B", opts: { size: "30 inch" }, price: 200 },
      ],
    });
    const s = buildVariantSelector(p)!;
    assert.deepEqual(s.variants.map((v) => v.price), [4242, 4242]);
  });

  test("a value is 'available' when at least one variant carrying it is in stock", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { size: "20 inch", color: "Gray" }, price: 100, available: false },
        { sku: "B", opts: { size: "20 inch", color: "Walnut" }, price: 100, available: true },
        { sku: "C", opts: { size: "30 inch", color: "Gray" }, price: 200, available: false },
        { sku: "D", opts: { size: "30 inch", color: "Walnut" }, price: 200, available: false },
      ],
    });
    const s = buildVariantSelector(p)!;
    const size = s.axes.find((a) => a.key === "size")!;
    assert.equal(size.values.find((v) => v.value === "20 inch")!.available, true);
    assert.equal(size.values.find((v) => v.value === "30 inch")!.available, false);
  });
});

describe("initialSelection — opens on something buyable", () => {
  test("skips a sold-out leading variant for the first in-stock one", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { size: "60 inch" }, price: 3000, available: false },
        { sku: "B", opts: { size: "48 inch" }, price: 2000, available: true },
      ],
    });
    const s = buildVariantSelector(p)!;
    const sel = initialSelection(s);
    assert.deepEqual(sel, { size: "48 inch" });
    assert.equal(resolveVariant(s.variants, sel)!.price, 2000);
  });

  test("falls back to the first variant when everything is sold out", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { size: "60 inch" }, price: 3000, available: false },
        { sku: "B", opts: { size: "48 inch" }, price: 2000, available: false },
      ],
    });
    const s = buildVariantSelector(p)!;
    assert.deepEqual(initialSelection(s), { size: "60 inch" });
  });
});

describe("selectAxisValue — sparse option spaces", () => {
  // Mirrors the real CVL20 shape: 72in exists ONLY as a double sink.
  const sparse = makeProduct({
    sku: "CVL20-DG-BN",
    variants: [
      { sku: "a", opts: { color: "Gray", size: "20 inch", style: "Single Sink" }, price: 2600 },
      { sku: "b", opts: { color: "Gray", size: "72 inch", style: "Double Sink" }, price: 4900 },
      { sku: "c", opts: { color: "Walnut", size: "20 inch", style: "Single Sink" }, price: 3100 },
      { sku: "d", opts: { color: "Walnut", size: "72 inch", style: "Double Sink" }, price: 9690 },
    ],
  });

  test("changing one axis holds the others when a real variant supports it", () => {
    const s = buildVariantSelector(sparse)!;
    const start = { color: "Gray", size: "20 inch", style: "Single Sink" };
    const r = selectAxisValue(s, start, "color", "Walnut");
    assert.deepEqual(r.selection, { color: "Walnut", size: "20 inch", style: "Single Sink" });
    assert.equal(r.variant!.price, 3100);
  });

  test("REGRESSION: an impossible combination auto-adjusts instead of dead-ending", () => {
    const s = buildVariantSelector(sparse)!;
    const start = { color: "Gray", size: "20 inch", style: "Single Sink" };
    const r = selectAxisValue(s, start, "size", "72 inch");
    // colour held; style moved to the only one that exists at 72in
    assert.deepEqual(r.selection, { color: "Gray", size: "72 inch", style: "Double Sink" });
    assert.equal(r.variant!.price, 4900);
  });

  test("every single-axis click resolves to a real variant (no dead ends anywhere)", () => {
    const s = buildVariantSelector(sparse)!;
    let cur = initialSelection(s);
    for (const a of s.axes) {
      for (const v of a.values) {
        const r = selectAxisValue(s, cur, a.key, v.value);
        assert.ok(r.variant, `click ${a.key}=${v.value} must resolve to a variant`);
        assert.equal(r.variant!.optionValues[a.key], v.value, "the clicked value must be honoured");
        assert.ok(resolveVariant(s.variants, r.selection), "the resulting selection must exist");
        cur = r.selection;
      }
    }
  });

  test("holding the other axes BEATS availability (no silent colour change)", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { color: "Gray", size: "20 inch" }, price: 100, available: false },
        { sku: "B", opts: { color: "Gray", size: "30 inch" }, price: 200, available: false },
        { sku: "C", opts: { color: "Walnut", size: "30 inch" }, price: 300, available: true },
      ],
    });
    const s = buildVariantSelector(p)!;
    const r = selectAxisValue(s, { color: "Gray", size: "20 inch" }, "size", "30 inch");
    // Gray-30 is SOLD OUT and Walnut-30 is in stock, but switching the rep's colour
    // without being asked is the surprise-jump behaviour killed on 2026-07-31. Keep Gray
    // and let the sold-out state show — availability must not override axis-holding.
    assert.equal(r.variant!.sku, "B");
    assert.equal(r.selection.color, "Gray");
  });

  test("availability only breaks a GENUINE tie (no other axis matches either candidate)", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { color: "Gray", size: "20 inch" }, price: 100 },
        { sku: "B", opts: { color: "Walnut", size: "30 inch" }, price: 200, available: false },
        { sku: "C", opts: { color: "Natural Oak", size: "30 inch" }, price: 300, available: true },
      ],
    });
    const s = buildVariantSelector(p)!;
    // Neither 30in candidate is Gray, so they score equally on axis-holding → in-stock wins.
    const r = selectAxisValue(s, { color: "Gray", size: "20 inch" }, "size", "30 inch");
    assert.equal(r.variant!.sku, "C");
    assert.equal(r.variant!.available, true);
  });
});

describe("resolveVariant", () => {
  test("returns null when the selection matches nothing", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { size: "20 inch" }, price: 100 },
        { sku: "B", opts: { size: "30 inch" }, price: 200 },
      ],
    });
    const s = buildVariantSelector(p)!;
    assert.equal(resolveVariant(s.variants, { size: "99 inch" }), null);
  });
});

describe("per-variant imagery (Slice 1c)", () => {
  test("each variant carries its own photo through to the selector", () => {
    const p = makeProduct({
      sku: "CVB24-84G",
      variants: [
        { sku: "G", opts: { color: "Grey" }, price: 100, image: "https://blob/v0.webp" },
        { sku: "W", opts: { color: "White" }, price: 100, image: "https://blob/v1.webp" },
      ],
    });
    const s = buildVariantSelector(p)!;
    assert.equal(resolveVariant(s.variants, { color: "Grey" })!.image, "https://blob/v0.webp");
    assert.equal(resolveVariant(s.variants, { color: "White" })!.image, "https://blob/v1.webp");
  });

  test("a variant with no photo yields null so the UI falls back to the product hero", () => {
    const p = makeProduct({
      sku: "X",
      variants: [
        { sku: "A", opts: { color: "Grey" }, price: 100 },
        { sku: "B", opts: { color: "White" }, price: 100 },
      ],
    });
    const s = buildVariantSelector(p)!;
    assert.equal(resolveVariant(s.variants, { color: "Grey" })!.image, null);
  });
});

describe("selection policy — keyed by MODEL, not by family key", () => {
  // REGRESSION (2026-08-05). The policy used to be keyed on the full family key inside
  // ProductView. Families can carry a subtype segment, and `CVI-TC` / `CVI-LC` each have TWO
  // colour siblings — so they DO get a cross-link Colour axis, but the family lookup missed
  // them, their in-place selector was dropped, and their 3 handle finishes were reachable
  // only from the raw variant matrix. Exactly 4 products were affected; found by running the
  // real selection logic over all 217 (tests/selection-census.mjs), not by reading code.
  test("modelOfFamily strips the subtype segment", () => {
    assert.equal(modelOfFamily("CVI-TC"), "CVI");
    assert.equal(modelOfFamily("CVI-LC"), "CVI");
    assert.equal(modelOfFamily("CVL-TC"), "CVL");
    assert.equal(modelOfFamily("CVH"), "CVH");
  });

  test("modelOfFamily is safe on junk input", () => {
    assert.equal(modelOfFamily(""), "");
    assert.equal(modelOfFamily(undefined as unknown as string), "");
    assert.equal(modelOfFamily(null as unknown as string), "");
  });

  test("REGRESSION: subtype families resolve to an enabled model", () => {
    for (const family of ["CVI-TC", "CVI-LC", "CVL-TC", "CVL-LC"]) {
      assert.ok(
        MIXED_SELECTOR_MODELS.has(modelOfFamily(family)),
        `${family} must inherit its model's mixed-selector policy`
      );
      // ...and this is what the old family-keyed lookup did instead:
      assert.ok(!MIXED_SELECTOR_MODELS.has(family), `${family} is NOT itself a policy key — that was the bug`);
    }
  });

  test("plain (subtype-less) families still resolve, unchanged", () => {
    for (const m of ["CVD", "CVK", "CVE", "CVG", "CVL", "CVI", "CVH"])
      assert.ok(MIXED_SELECTOR_MODELS.has(modelOfFamily(m)));
  });

  test("a model NOT on the allowlist stays off it, via either key form", () => {
    // ⚠ REWRITTEN 2026-08-07, deliberately. This listed CVB and CVC among the excluded
    // models, because their SKU grammar was unverified. It has now been verified and given
    // its own parse branch (MODULAR_LINE_MODELS), so they are legitimately IN the policy —
    // see the modular-configurator tests. CVJ and CVF remain unverified and stay out.
    //
    // The PROPERTY this test guards is unchanged and is not about any particular model: a
    // model that is not on the allowlist must not be swept in by the family-key lookup.
    // Replacing the examples is only legitimate because the property is re-pinned below at
    // least as strongly — including a synthetic key and a subtype form.
    // CVF LEFT this list on 2026-08-10 — its grammar (CVF{size}[D]W{F|L}) is now verified
    // and split into two deliberate families (WF countertop / WL wall-hung). CVJ remains
    // unverified and stays out. The PROPERTY is unchanged: a model not on the allowlist must
    // not be swept in by the family-key lookup.
    for (const family of ["CVJ", "CVJ-TC", "B834M", "ZZZ", "CVQ-99"])
      assert.ok(!MIXED_SELECTOR_MODELS.has(modelOfFamily(family)), `${family} must stay excluded`);
  });

  test("the newly-verified modular models ARE on the allowlist, by model key", () => {
    // The other half of the rewrite above: CVB/CVC are in, and specifically via the MODEL
    // key rather than the family key. The split lines produce families like "CVB-36", and
    // if modelOfFamily didn't reduce that to "CVB" they would silently drop out of mixed
    // mode — which means no native colour picker on 18 products.
    for (const family of ["CVB-24", "CVB-30", "CVB-36", "CVC-24", "CVC-30", "CVC-36"]) {
      assert.equal(modelOfFamily(family), family.slice(0, 3));
      assert.ok(
        MIXED_SELECTOR_MODELS.has(modelOfFamily(family)),
        `${family} must inherit its model's mixed-selector policy`,
      );
      assert.ok(!MIXED_SELECTOR_MODELS.has(family), `${family} is NOT itself a policy key`);
    }
  });

  test("NATIVE_WINS_AXES is model-keyed too (CVH size, and only CVH)", () => {
    assert.deepEqual(NATIVE_WINS_AXES[modelOfFamily("CVH")], ["size"]);
    assert.equal(NATIVE_WINS_AXES[modelOfFamily("CVI-TC")], undefined);
  });
});


describe("orderGalleryForVariant — selection-aware gallery ordering (2026-08-05)", () => {
  // the supplier mixes photos of different variants of the same model into one product gallery:
  // 270 of 1,246 images (22%) across 62 of 217 products. We ORDER, never FILTER —
  // filtering to "matches the shown variant" was measured and would leave 50 products
  // with ZERO images and 40 more with one, because ~28% of images are generically named.
  const b525 = [
    "https://b/B525-IO.jpg", "https://b/B525-IO-1.jpg", "https://b/B525-IO-2.jpg",
    "https://b/36.jpg", "https://b/B525-BN-1.jpg",
  ];

  test("leads with the selected variant's own photo", () => {
    const out = orderGalleryForVariant(b525, "https://b/B525-BN-1.jpg", "B525-BN");
    assert.equal(out[0], "https://b/B525-BN-1.jpg");
  });

  test("groups the selected variant's OTHER photos right behind the hero", () => {
    // Selecting the IO trim should surface all three IO shots before unrelated ones.
    const out = orderGalleryForVariant(b525, "https://b/B525-IO.jpg", "B525-IO");
    assert.deepEqual(out.slice(0, 3), [
      "https://b/B525-IO.jpg", "https://b/B525-IO-1.jpg", "https://b/B525-IO-2.jpg",
    ]);
  });

  test("INVARIANT: nothing is ever dropped (output is a permutation of the input)", () => {
    for (const sku of ["B525-BN", "B525-IO", "NOPE-1", null]) {
      const out = orderGalleryForVariant(b525, "https://b/B525-IO-2.jpg", sku);
      assert.equal(out.length, b525.length, `length changed for ${sku}`);
      assert.deepEqual([...out].sort(), [...b525].sort(), `set changed for ${sku}`);
    }
  });

  test("generically-named images survive (the ~28% that match no SKU)", () => {
    const out = orderGalleryForVariant(b525, "https://b/B525-IO.jpg", "B525-IO");
    assert.ok(out.includes("https://b/36.jpg"), "a lifestyle/detail shot must not be lost");
  });

  test("a variant photo that ISN'T in the gallery is prepended, not swallowed", () => {
    const out = orderGalleryForVariant(b525, "https://b/B525-TG-9.jpg", "B525-TG");
    assert.equal(out[0], "https://b/B525-TG-9.jpg");
    assert.equal(out.length, b525.length + 1);
  });

  test("no duplicate when the variant photo is already in the gallery", () => {
    const out = orderGalleryForVariant(b525, "https://b/B525-IO-1.jpg", "B525-IO");
    assert.equal(new Set(out).size, out.length);
  });

  test("no SKU → previous Slice-1c behaviour (hero first, rest untouched)", () => {
    const out = orderGalleryForVariant(b525, "https://b/36.jpg", null);
    assert.deepEqual(out, ["https://b/36.jpg", ...b525.filter((u) => u !== "https://b/36.jpg")]);
  });

  test("nothing selected → gallery order is untouched", () => {
    assert.deepEqual(orderGalleryForVariant(b525, null, null), b525);
  });

  test("a too-short SKU key does NOT over-match", () => {
    // A 1-2 char key would prefix-match nearly everything; guard requires >=3.
    const out = orderGalleryForVariant(b525, null, "B");
    assert.deepEqual(out, b525, "a 1-char SKU must not reorder the gallery");
  });

  test("real case B813B2-BN: selecting the sibling size surfaces its 6 photos", () => {
    const imgs = [
      "https://b/B813B1-BN_1.jpg", "https://b/B813B1-BN_2.jpg", "https://b/B813B1-BN_3.jpg",
      "https://b/B813B1-BN_4.jpg", "https://b/B813B1-BN_5.jpg", "https://b/B813B1-BN_6.jpg",
    ];
    const out = orderGalleryForVariant(imgs, "https://b/B813B1-BN_4.jpg", "B813B1-BN");
    assert.equal(out[0], "https://b/B813B1-BN_4.jpg");
    assert.equal(out.length, 6);
    assert.deepEqual([...out].sort(), [...imgs].sort());
  });
});
