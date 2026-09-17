// spec-sheets.data.ts — the set of product keys that have a downloadable spec-sheet PDF
// in public/specs/.
//
// In this portfolio demo there are no spec-sheet PDFs (the real ones are supplier documents),
// so this set is empty: the product page simply shows no "Spec Sheet" button, and nothing is
// precached for offline. The lookup/precache code paths are unchanged.
export const SPEC_SHEETS: ReadonlySet<string> = new Set<string>();
