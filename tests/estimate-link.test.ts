// Estimate-line link resilience — survive a Artisan Bath Co. rename (2026-09-03).
//
// An estimate line links to /product/{slug}, but slug = the supplier's handle, a SYNCED field that changes
// when the supplier renames a product (the sync's identity-changed case) — which 404'd the link. The line
// now carries the STABLE source id as ?sid=, and the product route (online) + offline shell recover
// the renamed product by it. These pin the two pure pieces: productHref and productBySourceId.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { productHref } from "../lib/estimate";
import { productBySourceId } from "../lib/catalog-shared";
import type { Product } from "@/schema/types";

describe("productHref", () => {
  test("a Artisan Bath Co. line carries the stable source id as ?sid=", () => {
    assert.equal(
      productHref({ source: "vanity-art", slug: "cvl84d-vg", sourceId: "7788" }),
      "/product/cvl84d-vg?sid=7788",
    );
  });
  test("no sourceId (a line added before this shipped) → plain slug link, still works", () => {
    assert.equal(productHref({ source: "vanity-art", slug: "cvl84d-vg", sourceId: null }), "/product/cvl84d-vg");
    assert.equal(productHref({ source: "vanity-art", slug: "cvl84d-vg" } as any), "/product/cvl84d-vg");
  });
  test("toilets are static (stable slug) — no sid, /lowes route", () => {
    assert.equal(productHref({ source: "toilet", slug: "highline", sourceId: "x" }), "/lowes/highline");
  });
  test("the source id is URL-encoded", () => {
    assert.equal(productHref({ source: "vanity-art", slug: "s", sourceId: "a b/c" }), "/product/s?sid=a%20b%2Fc");
  });
});

describe("productBySourceId (offline recovery)", () => {
  const products = [
    { slug: "a", source: { id: "100" } },
    { slug: "b", source: { id: 200 } }, // Shopify ids can be numeric — match stringly
  ] as unknown as Product[];

  test("recovers a product by its stable id even after its slug changed", () => {
    assert.equal(productBySourceId(products, "100")?.slug, "a");
  });
  test("matches a numeric source id against the string sid", () => {
    assert.equal(productBySourceId(products, "200")?.slug, "b");
  });
  test("returns null for a missing id or an empty/absent sid", () => {
    assert.equal(productBySourceId(products, "999"), null);
    assert.equal(productBySourceId(products, ""), null);
    assert.equal(productBySourceId(products, null), null);
    assert.equal(productBySourceId(products, undefined), null);
  });
});
