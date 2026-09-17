// Sold-out card badge — flag a product/tile whose every variant is unavailable at the supplier (2026-09-03).
//
// Found in an edge-state pass while reps were live: 37 published products (33 in home categories)
// have every variant sold out, but browse showed them as normal until you opened the page. Steven
// confirmed "sold out" = the supplier has no stock. These pin the flag: product-level truth + the group rule
// (a collapsed size-ladder tile is sold out ONLY if EVERY size is, so real availability is never
// hidden behind the badge).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isAllSoldOut,
  soldOutRank,
  productToItem,
  computeBrowseGroups,
  applyBrowseGroups,
  searchItems,
} from "../lib/catalog-shared";
import { makeProduct } from "./fixtures";
import type { Product } from "@/schema/types";

describe("isAllSoldOut", () => {
  test("true only when every variant is explicitly available:false", () => {
    assert.equal(isAllSoldOut([{ available: false }, { available: false }]), true);
  });
  test("one available variant keeps it orderable", () => {
    assert.equal(isAllSoldOut([{ available: false }, { available: true }]), false);
  });
  test("absent/undefined availability is treated as AVAILABLE (unknown ≠ sold out)", () => {
    assert.equal(isAllSoldOut([{}, {}]), false);
    assert.equal(isAllSoldOut([{ available: false }, {}]), false);
  });
  test("an empty or missing variant list is NOT sold out (we don't know)", () => {
    assert.equal(isAllSoldOut([]), false);
    assert.equal(isAllSoldOut(null), false);
    assert.equal(isAllSoldOut(undefined), false);
  });
});

describe("productToItem carries soldOut", () => {
  test("a fully sold-out product maps to soldOut:true", () => {
    const p = makeProduct({ sku: "CVF30WL", slug: "cvf30wl", variants: [{ sku: "CVF30WL", price: 900, available: false }] });
    assert.equal(productToItem(p).soldOut, true);
  });
  test("a product with an available variant maps to soldOut:false", () => {
    const p = makeProduct({ sku: "CVK30-DG-BN", slug: "cvk30", variants: [{ sku: "CVK30-DG-BN", price: 1500, available: true }] });
    assert.equal(productToItem(p).soldOut, false);
  });
});

describe("applyBrowseGroups — a collapsed tile is sold out only if EVERY size is", () => {
  // CVB is a modular, TITLE-driven size ladder that computeBrowseGroups collapses (per browse-group.test).
  const size = (sku: string, title: string, price: number, available: boolean): Product =>
    makeProduct({ sku, slug: sku.toLowerCase(), title, variants: [{ sku, price, available }] });

  test("all sizes sold out → the tile is badged sold out", () => {
    const fam = [
      size("CVB36-B", '36" Bathroom Vanity with White Ceramic Top CVB36', 2000, false),
      size("CVB36-48B", '48" Bathroom Vanity with White Ceramic Top CVB36-48', 2400, false),
      size("CVB36-60B", '60" Bathroom Vanity with White Ceramic Top CVB36-60', 2800, false),
    ];
    const grouped = applyBrowseGroups(fam.map(productToItem), computeBrowseGroups(fam));
    assert.equal(grouped.length, 1, "the ladder collapses to one tile");
    assert.equal(grouped[0].soldOut, true, "every size sold out → badge");
  });

  test("one available size → the tile is NOT badged (availability preserved)", () => {
    const fam = [
      size("CVB36-B", '36" Bathroom Vanity with White Ceramic Top CVB36', 2000, false),
      size("CVB36-48B", '48" Bathroom Vanity with White Ceramic Top CVB36-48', 2400, true), // in stock
      size("CVB36-60B", '60" Bathroom Vanity with White Ceramic Top CVB36-60', 2800, false),
    ];
    const grouped = applyBrowseGroups(fam.map(productToItem), computeBrowseGroups(fam));
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].soldOut, false, "one available size must keep the tile un-badged");
  });
});

describe("sold-out sinks to the bottom (available-first ordering)", () => {
  test("soldOutRank: available = 0, sold out = 1", () => {
    assert.equal(soldOutRank({ soldOut: false }), 0);
    assert.equal(soldOutRank({ soldOut: true }), 1);
    assert.equal(soldOutRank({}), 0, "unknown defaults to available");
  });

  test("search returns available before sold out, even when the sold-out one is cheaper", () => {
    const soldCheap = makeProduct({ sku: "CVF30WL", slug: "cvf30wl", title: "Cheap Vanity", variants: [{ sku: "CVF30WL", price: 500, available: false }] });
    const availPricey = makeProduct({ sku: "CVK99", slug: "cvk99", title: "Pricey Vanity", variants: [{ sku: "CVK99", price: 5000, available: true }] });
    const r = searchItems([soldCheap, availPricey], "vanity");
    assert.deepEqual(r.map((i) => i.sku), ["CVK99", "CVF30WL"], "the $5000 available item ranks above the $500 sold-out one");
  });

  test("within the available group, the chosen order (cheapest-first) still holds", () => {
    const a = makeProduct({ sku: "A", slug: "a", title: "vanity a", variants: [{ sku: "A", price: 2000, available: true }] });
    const b = makeProduct({ sku: "B", slug: "b", title: "vanity b", variants: [{ sku: "B", price: 1000, available: true }] });
    const r = searchItems([a, b], "vanity");
    assert.deepEqual(r.map((i) => i.sku), ["B", "A"], "cheapest available first");
  });
});
