// The product page's SKU line follows the rep's selection (2026-08-07).
//
// THE ASK (CEO): "why don't the SKUs show up differently when you click the configured
// options?" It was a real gap, and the same principle applied to the toilets' Item #/Model #
// earlier the same day — a rep needs the code for the thing ACTUALLY SELECTED, not the
// product's default. Half of it already worked: changing SIZE on the split modular lines
// navigates to a different product, so that arrives via a page load. In-place changes
// (colour and other native axes) did not update the line at all.
//
// WHY THE DECISION IS A PURE FUNCTION. The component is a two-line wrapper around
// `displaySku` because this project has no React renderer in its test setup, and a rule that
// lives only inside JSX is a rule nobody can pin. The fallback chain is the part with real
// failure modes, so it is the part that gets tested.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { displaySku } from "../lib/helpers";

describe("displaySku — which SKU the page shows", () => {
  test("the selected variant's SKU wins", () => {
    assert.equal(displaySku("CVB36-108DG", "CVB36-108B"), "CVB36-108DG");
  });

  test("falls back to the product's SKU when nothing is selected yet", () => {
    // First paint, before the selector's effect publishes: the line must read exactly what
    // it read before this change, not blank and not "undefined".
    assert.equal(displaySku(null, "CVB36-108B"), "CVB36-108B");
    assert.equal(displaySku(undefined, "CVB36-108B"), "CVB36-108B");
  });

  test("falls back when the SELECTED VARIANT has no SKU of its own", () => {
    // Not defensive padding: lib/sync.ts keys on the Shopify product id specifically because
    // the supplier's SKUs carry "nulls + collisions". A null variant SKU is real data, and it must not
    // blank the line — the product SKU is still the best answer available.
    assert.equal(displaySku(null, "CVB30-96G"), "CVB30-96G");
    assert.equal(displaySku("", "CVB30-96G"), "CVB30-96G", "empty string is not a SKU");
  });

  test("an em dash when there is genuinely nothing — matching the old behaviour", () => {
    // The pre-change line was `product.sourceSku ?? "—"`, and at least one published product
    // (the sold-out CVM48 top) has a null SKU. That must still render an em dash.
    assert.equal(displaySku(null, null), "—");
    assert.equal(displaySku(undefined, undefined), "—");
    assert.equal(displaySku("", ""), "—");
  });

  test("never returns a non-string, whatever it is handed", () => {
    for (const [a, b] of [[null, null], ["", null], [null, ""], ["A", "B"]] as const)
      assert.equal(typeof displaySku(a, b), "string");
  });

  test("does not 'helpfully' trim or reformat the SKU", () => {
    // These are order codes. Whatever the supplier stores is what a rep reads out; the same rule the
    // toilets' Item #/Model # follow. Reformatting an order code is how the wrong item ships.
    assert.equal(displaySku("cvb36-108b", null), "cvb36-108b");
    assert.equal(displaySku("CVD12-1BROWN+24-BROWN", null), "CVD12-1BROWN+24-BROWN");
    assert.equal(displaySku("36 ceramic sink", null), "36 ceramic sink");
  });
});
