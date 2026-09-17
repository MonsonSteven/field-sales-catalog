// Central config for the Product Estimate feature — the customer-facing NAMING and
// DISCLAIMER. Change these strings to re-label the whole feature + document at once
// (e.g. if the CMO redlines the wording after reveal). None of this affects the
// estimate mechanics — it's pure display text.
//
// Naming locked by Steven 2026-07-29: "Product Estimate" (scopes it to the products,
// not the whole job/bill) + document "Product Estimate Sheet". Disclaimer = Draft A.
// Not legal advice; leadership/CMO owns the final wording.

export const ESTIMATE_VALIDITY_DAYS = 30;

export const ESTIMATE = {
  /** The feature / priced selection. */
  featureName: "Product Estimate",
  /** The printable/shareable document title. */
  docTitle: "Product Estimate Sheet",
  /** Call-to-action verb on product pages. */
  addVerb: "Add to Product Estimate",
  validityDays: ESTIMATE_VALIDITY_DAYS,
  /** Customer-facing footer (Draft A). Edit freely — CMO owns final wording. */
  disclaimer:
    "This Product Estimate is for planning purposes and is not a binding contract or final offer. " +
    // ⚠ CORRECTED 2026-08-07 and it is NOT cosmetic. This previously read "…the selected
    // products with standard installation…". When leadership moved the bundled costs into
    // the Vendo app, the catalog formula became product-only — so that sentence became a
    // false statement about price, on a CUSTOMER-FACING document, in the one place a
    // customer would reasonably rely on it. Corrected immediately rather than left pending
    // review. ⇒ CMO still owns the final wording; this is the truthful minimum, not the
    // finished copy.
    `Prices reflect the selected products only; installation is quoted separately. Estimates are valid for ${ESTIMATE_VALIDITY_DAYS} days. ` +
    "Final pricing is subject to in-home measurement, site conditions, and product availability. " +
    "Applicable sales tax, permits, and additional work are not included unless noted. " +
    "Summit Home Improvement reserves the right to revise this estimate.",
} as const;
