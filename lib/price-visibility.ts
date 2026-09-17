"use client";

// Per-device "hide prices" toggle — the rep-facing presentation mode (2026-09).
//
// WHY PER-DEVICE (localStorage), not per-user: leadership provisioned a SINGLE universal rep
// login, so there is no per-rep identity to hang a preference on. The choice lives on the device.
//
// WHY THE <html> ATTRIBUTE IS THE SOURCE OF TRUTH (not React state): a price must never flash on
// screen before hiding — the whole point is hiding it in front of a customer. So an inline script
// in the root layout sets `data-hide-price` on <html> BEFORE first paint (see app/(frontend)/
// layout.tsx), and one CSS rule hides every `.price` / `.price-box` / `.price-private` element
// while it's set. That covers the printed estimate too (print inherits the same DOM + CSS). This
// module keeps localStorage + the attribute in sync and exposes a hook so the toggle button (and
// the few prices CSS can't reach, like <select> option text) can react. DEFAULT = prices SHOWN.
import { useSyncExternalStore } from "react";

const KEY = "summit-hide-price";
const ATTR = "data-hide-price";
const EVENT = "summit-hide-price-change";

/** Current state, read from the <html> attribute (set pre-paint by the inline script). */
export function isPriceHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(ATTR) === "1";
}

/** Set the state: persist to localStorage, flip the attribute (drives the CSS), notify hooks. */
export function setPriceHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode / storage disabled — the attribute below still drives this session */
  }
  if (typeof document !== "undefined") {
    if (hidden) document.documentElement.setAttribute(ATTR, "1");
    else document.documentElement.removeAttribute(ATTR);
    window.dispatchEvent(new Event(EVENT));
  }
}

export function togglePriceHidden(): void {
  setPriceHidden(!isPriceHidden());
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // cross-tab / other windows on the same device
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** React hook: are prices hidden? For the toggle button and any price CSS can't hide (e.g. text
 *  inside a <select> option). getServerSnapshot is false — prices default to SHOWN on the server. */
export function usePriceHidden(): boolean {
  return useSyncExternalStore(subscribe, isPriceHidden, () => false);
}
