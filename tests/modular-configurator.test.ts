// The modular CVB/CVC lines — size picker restored across split products (2026-08-07).
//
// WHAT THIS FIXES. Artisan Bath Co. has been splitting these lines from ONE listing with a size
// axis into ONE PRODUCT PER SIZE. Prices and photos stayed right, but the relationship
// between the sizes was gone: a rep had to back out to the category list to show the next
// size up. 18 published products were in that state (CVB24 since 06 Aug, CVB30/CVB36 since
// 07 Aug).
//
// ⚠ WHY THE OBVIOUS FIX WOULD HAVE BEEN A DISASTER, which is what most of these tests guard.
// Simply allowlisting "CVB" makes the generic vanity grammar read segment 0 as MODEL+SIZE,
// but on these lines segment 0 is MODEL+MODULE WIDTH. Measured before the fix:
//     CVB36-108B -> { family:"CVB", size:36, color:"108b" }
// A 108-inch vanity parsed as 36 inches, the real size swallowed into `color` as a bogus
// finish name, and CVB24/CVB30/CVB36 collapsed into ONE family. It doesn't fail — it returns
// a confident, well-formed, wrong answer that looks plausible on screen. Every assertion
// below about families and colours exists because of that.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseSku, buildConfigurator, modelOfFamily, MIXED_SELECTOR_MODELS,
} from "../lib/catalog-shared";
import type { Product } from "@/schema/types";

// Minimal Product good enough for parseSku + buildConfigurator.
const prod = (sourceSku: string, title: string): Product =>
  ({
    sourceSku, title, slug: sourceSku.toLowerCase(), category: "Vanities",
    variants: [{ sourceSku, available: true, optionValues: { color: "Gray" } }],
    images: { primary: null, gallery: [] },
    pricing: {}, attributes: {}, tags: [],
  }) as unknown as Product;

// The real published shape, as it exists in the live catalog.
const CVB36 = [
  prod("CVB36-B", '36" Bathroom Vanity with White Ceramic Top and Mirrors CVB36'),
  prod("CVB36-48B", '48" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-48'),
  prod("CVB36-60B", '60" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-60'),
  prod("CVB36-84B", '84" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-84'),
  prod("CVB36-96B", '96" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-96'),
  prod("CVB36-108B", '108" Bathroom Vanity with White Ceramic Top and Mirrors CVB36-108'),
];
const CVB30 = [
  prod("CVB30-B", '30" Bathroom Vanity with Basin Vanity Ceramic Top CVB30'),
  prod("CVB30-42B", '42" Bathroom Vanity with Basin Vanity Ceramic Top CVB30-42'),
  prod("CVB30-54B", '54" Bathroom Vanity with Basin Vanity Ceramic Top CVB30-54'),
  prod("CVB30-72B", '72" Bathroom Vanity with Basin Vanity Ceramic Top CVB30-72'),
  prod("CVB30-84VG", '84" Bathroom Vanity with Basin Vanity Ceramic Top CVB30-84'),
  prod("CVB30-96G", '96" Bathroom Vanity with Basin Vanity Ceramic Top CVB30-96'),
];
const CVB24 = [
  prod("CVB24-24G", '24" Bathroom Vanity with Ceramic Top and Mirror CVB24'),
  prod("CVB24-84G", '84" Bathroom Vanity with Ceramic Top and Mirror CVB24-84'),
];
const ALL = [...CVB36, ...CVB30, ...CVB24];
const sizesOf = (p: Product) =>
  buildConfigurator(p, ALL)?.axes.find((a) => a.key === "size")?.options.map((o) => o.label) ?? null;

describe("parseSku — the modular grammar", () => {
  test("size comes from the TITLE, not the module width in the SKU", () => {
    const p = parseSku("CVB36-108B", '108" Bathroom Vanity …');
    assert.equal(p?.size, 108, "108 inch, NOT the 36 inch module width");
  });

  test("THE SILENT CORRUPTION IS GONE: the size is not swallowed into `color`", () => {
    // Pre-fix this returned color:"108b" and rendered it as a finish name.
    for (const [sku, title] of [
      ["CVB36-108B", '108" x'], ["CVB30-84VG", '84" x'], ["CVB24-84G", '84" x'],
    ] as const)
      assert.equal(parseSku(sku, title)?.color, null, `${sku} must expose no cross-product colour`);
  });

  test("the irregular SKUs parse: size digits are OMITTED when size == module width", () => {
    // The same concept encoded three ways across three sibling lines.
    assert.equal(parseSku("CVB36-B", '36" x')?.size, 36, "no digits -> module width");
    assert.equal(parseSku("CVB30-B", '30" x')?.size, 30);
    assert.equal(parseSku("CVB24-24G", '24" x')?.size, 24, "…but CVB24 writes them out");
  });

  test("families stay SEPARATE — the catastrophic failure of the naive fix", () => {
    const f = (s: string, t: string) => parseSku(s, t)?.family;
    assert.equal(f("CVB24-84G", '84" x'), "CVB-24");
    assert.equal(f("CVB30-84VG", '84" x'), "CVB-30");
    assert.equal(f("CVB36-84B", '84" x'), "CVB-36");
    assert.equal(new Set([f("CVB24-84G", '84" x'), f("CVB30-84VG", '84" x'), f("CVB36-84B", '84" x')]).size, 3,
      "three distinct product lines must never merge into one family");
  });

  test("the family key reduces to the MODEL, so mixed mode applies", () => {
    // Without the hyphen, modelOfFamily("CVB36") returns "CVB36", which matches nothing in
    // MIXED_SELECTOR_MODELS — and 18 products silently lose their native colour picker.
    assert.equal(modelOfFamily("CVB-36"), "CVB");
    assert.ok(MIXED_SELECTOR_MODELS.has(modelOfFamily("CVB-36")));
    assert.ok(MIXED_SELECTOR_MODELS.has(modelOfFamily("CVC-24")));
  });
});

describe("parseSku — refusing to guess", () => {
  test("no title -> null, i.e. no configurator (the pre-fix behaviour)", () => {
    assert.equal(parseSku("CVB36-108B"), null);
    assert.equal(parseSku("CVB36-108B", null), null);
  });

  test("SKU digits and title DISAGREEING -> null, rather than picking a winner", () => {
    // If these two ever diverge, one of our assumptions about the line is wrong. Refusing
    // costs a configurator; guessing puts a wrong size in front of a customer.
    assert.equal(parseSku("CVB36-108B", '96" Bathroom Vanity …'), null);
    assert.equal(parseSku("CVB36-B", '48" Bathroom Vanity …'), null, "omitted digits mean module width");
  });

  test("an unparseable second segment -> null", () => {
    assert.equal(parseSku("CVB36-", '36" x'), null);
    assert.equal(parseSku("CVB36-12-34", '36" x'), null);
  });

  test("a title with no leading size -> null (the unsplit parents)", () => {
    // CVC24-84E etc. are still one product with a native size axis. Their titles carry no
    // leading size, so they keep the native selector — and gain a configurator for free the
    // moment the supplier splits them and gives each size its own titled product.
    assert.equal(parseSku("CVC24-84E", "Bathroom Vanity Set CVC24"), null);
  });
});

describe("buildConfigurator — the size row reps actually see", () => {
  test("every CVB36 product offers the whole ladder", () => {
    for (const p of CVB36)
      assert.deepEqual(sizesOf(p), ["36 in", "48 in", "60 in", "84 in", "96 in", "108 in"]);
  });

  test("the ladder is SPARSE by design — CVB36 has no 72 inch", () => {
    // 36in modules + 12in towers, two sink cabinets never adjacent => first double at 84in.
    assert.ok(!sizesOf(CVB36[0])!.includes("72 in"), "72 in does not exist in the CVB36 line");
  });

  test("CVB30 offers all six, including its two odd-colour members", () => {
    // The bug this caught: with colour treated as a cross-product axis, CVB30-84VG and
    // CVB30-96G fell OUT of the family and the row showed only 4 of 6 sizes, because
    // 42in(Blue) -> 84in(Vintage Green) reads as changing two axes at once.
    for (const p of CVB30)
      assert.deepEqual(sizesOf(p), ["30 in", "42 in", "54 in", "72 in", "84 in", "96 in"]);
  });

  test("a product never links to a different line's sizes", () => {
    assert.deepEqual(sizesOf(CVB24[0]), ["24 in", "84 in"], "only its own family's members");
  });

  test("size labels carry no invented sink wording", () => {
    // These SKUs have no D/S marker; bowl count comes from PER_SIZE_BOWL, not the SKU.
    for (const label of sizesOf(CVB36[0])!) assert.doesNotMatch(label, /sink/i);
  });
});
