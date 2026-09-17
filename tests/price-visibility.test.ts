// Price-visibility store — the per-device "hide prices" presentation toggle (2026-09).
//
// The <html data-hide-price> attribute is the SOURCE OF TRUTH (set pre-paint, drives the CSS,
// carries into print); localStorage persists it across launches. These tests pin that contract
// with lightweight DOM stubs — no browser, matching the suite's zero-dep style. The React hook
// (usePriceHidden) is intentionally not exercised here; it's a thin useSyncExternalStore wrapper.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- minimal DOM/storage stubs, installed before importing the module under test ---
function installStubs() {
  const attrs = new Map<string, string>();
  const store = new Map<string, string>();
  (globalThis as any).document = {
    documentElement: {
      getAttribute: (k: string) => (attrs.has(k) ? attrs.get(k)! : null),
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    },
  };
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  let events = 0;
  (globalThis as any).window = { dispatchEvent: () => (events++, true) };
  return { attrs, store, events: () => events };
}

let ctx: ReturnType<typeof installStubs>;
beforeEach(() => {
  ctx = installStubs();
});

const mod = await import("../lib/price-visibility");

describe("price-visibility store", () => {
  test("default is SHOWN (no attribute, no storage)", () => {
    assert.equal(mod.isPriceHidden(), false);
    assert.equal(ctx.attrs.get("data-hide-price"), undefined);
  });

  test("setPriceHidden(true) sets the <html> attribute AND persists to localStorage", () => {
    mod.setPriceHidden(true);
    assert.equal(mod.isPriceHidden(), true);
    assert.equal(ctx.attrs.get("data-hide-price"), "1", "attribute drives the CSS");
    assert.equal(ctx.store.get("summit-hide-price"), "1", "persisted across launches");
  });

  test("setPriceHidden(false) clears both", () => {
    mod.setPriceHidden(true);
    mod.setPriceHidden(false);
    assert.equal(mod.isPriceHidden(), false);
    assert.equal(ctx.attrs.get("data-hide-price"), undefined);
    assert.equal(ctx.store.get("summit-hide-price"), undefined);
  });

  test("togglePriceHidden flips the current state", () => {
    assert.equal(mod.isPriceHidden(), false);
    mod.togglePriceHidden();
    assert.equal(mod.isPriceHidden(), true);
    mod.togglePriceHidden();
    assert.equal(mod.isPriceHidden(), false);
  });

  test("each change notifies subscribers (dispatches an event)", () => {
    const before = ctx.events();
    mod.setPriceHidden(true);
    assert.ok(ctx.events() > before, "a change event fires so the toggle button + hooks update");
  });

  test("the attribute is the source of truth: isPriceHidden reads it even if set externally", () => {
    // The inline no-flash script sets the attribute directly before this module runs.
    (globalThis as any).document.documentElement.setAttribute("data-hide-price", "1");
    assert.equal(mod.isPriceHidden(), true);
  });
});
