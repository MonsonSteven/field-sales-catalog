// vanity-dimensions.data.ts — Summit-authored overall cabinet dimensions for the supplier vanities,
// keyed by MODEL (line + size, e.g. "CVL36"; doubles keep the "D"/"S" suffix; linen/tall
// cabinets use the "-LC"/"-TC" subtype token).
//
// ⚙ GENERATED FILE — do not hand-edit. Regenerate with:
//     python tools/spec-sheets/extract-vanity-dimensions.py
// from the supplier's per-line "3D spec" PDFs (engineering sketches; each page a size, with a clean
// `Model <MODEL> Cabinet:<W>x<D>x<H>` text header). 100% parse, every page of all sheets,
// cross-checked against the live catalog SKUs. Sheets used (newest version of each):
//    CVE: CVE 3D spec update on Sep 26th.pdf
//    CVG: CVG 3D spec update on Sep 26th.pdf
//    CVH: CVH 3D spec update on Sep 26th.pdf
//    CVI: CVI 3D spec update on Sep 26th.pdf
//    CVK: CVK 3D spec update on Sep 26th.pdf
//    CVL: CVL 3D spec update on Sep 26th.pdf
//    CVM: CVM 3D spec - Dec 23rd Ver 1.0.pdf
//
// WHY. The product page's "Standard dimensions" note previously parsed depth/height from the supplier
// prose (~2/3 of vanities) and hedged otherwise. These give the EXACT overall W x D x H for
// the selected size on every covered model — a real number, per size, no prose guessing.
// Values are INCHES, overall assembled cabinet (matches the sketch header). Only W/D/H are
// kept — the sheets' "Handle:" callout parsed inconsistently across lines, so it is omitted
// rather than shipped unverified.
//
// COVERAGE + LIMITS (honest). Covers 7 rep-facing lines (CVE/CVG/CVH/CVI/CVK/CVL/CVM). NOT
// covered, and deliberately absent so the page falls back to its hedged note rather than a
// guess: CVA/CVB/CVC/CVF (the supplier renamed these from legacy the supplier#### model numbers; no CV-named
// sheet — the "rename decode" is separate work) and a few edge sizes (CVL84D — the sheet
// stops at 72"). A model that is absent here is NOT an error; it means "no authoritative
// sheet value", and the lookup returns null so the existing fallback stands.
//
// NOT a synced field and NOT keyed by full SKU: this is read-time reference data consumed by
// lookupVanityDimensions() in lib/catalog-shared.ts. Adding/removing a model here can never
// change pricing, status, or the sync.

/** Overall assembled cabinet dimensions in inches, keyed by model. */
export type VanityDim = { w: number; d: number; h: number };

export const VANITY_DIMENSIONS: Record<string, VanityDim> = {
  // CVE — CVE 3D spec update on Sep 26th.pdf
  "CVE20": { w: 20.2, d: 15.6, h: 34.5 },
  "CVE24": { w: 24.1, d: 18.3, h: 34.6 },
  "CVE30": { w: 30, d: 18.3, h: 34.6 },
  "CVE36": { w: 36, d: 22, h: 38 },
  "CVE48": { w: 48, d: 22, h: 38 },
  "CVE54": { w: 54, d: 22, h: 38 },
  "CVE72": { w: 72, d: 22, h: 38 },
  "CVE60D": { w: 60, d: 22, h: 38 },
  "CVE60S": { w: 60, d: 22, h: 38 },

  // CVG — CVG 3D spec update on Sep 26th.pdf
  "CVG20": { w: 20.2, d: 15.6, h: 34.1 },
  "CVG24": { w: 24.1, d: 18.3, h: 34.2 },
  "CVG36": { w: 36, d: 22, h: 38 },
  "CVG42": { w: 42, d: 22, h: 38 },
  "CVG48": { w: 48, d: 22, h: 38 },
  "CVG60D": { w: 60, d: 22, h: 38 },
  "CVG60S": { w: 60, d: 22, h: 38 },
  "CVG72D": { w: 72, d: 22, h: 38 },

  // CVH — CVH 3D spec update on Sep 26th.pdf
  "CVH30": { w: 30, d: 22, h: 38 },
  "CVH36": { w: 36, d: 22, h: 38 },
  "CVH42": { w: 42, d: 22, h: 38 },
  "CVH48": { w: 48, d: 22, h: 38 },
  "CVH72": { w: 72, d: 22, h: 38 },
  "CVH54D": { w: 54, d: 22, h: 38 },
  "CVH60D": { w: 60, d: 22, h: 38 },
  "CVH60S": { w: 60, d: 22, h: 38 },

  // CVI — CVI 3D spec update on Sep 26th.pdf
  "CVI20": { w: 20.2, d: 15.6, h: 34.1 },
  "CVI24": { w: 24.1, d: 18.3, h: 34.2 },
  "CVI30": { w: 30, d: 18.3, h: 34.2 },
  "CVI36": { w: 36, d: 22, h: 38 },
  "CVI42": { w: 42, d: 22, h: 38 },
  "CVI48": { w: 48, d: 22, h: 38 },
  "CVI72": { w: 72, d: 22, h: 38 },
  "CVI-LC": { w: 21, d: 17, h: 72 },
  "CVI-TC": { w: 24, d: 8, h: 33 },
  "CVI60D": { w: 60, d: 22, h: 38 },
  "CVI60S": { w: 60, d: 22, h: 38 },

  // CVK — CVK 3D spec update on Sep 26th.pdf
  "CVK30": { w: 30, d: 22, h: 38 },
  "CVK36": { w: 36, d: 22, h: 38 },
  "CVK42": { w: 42, d: 22, h: 38 },
  "CVK48": { w: 48, d: 22, h: 38 },
  "CVK72": { w: 72, d: 22, h: 38 },
  "CVK54D": { w: 54, d: 22, h: 38 },
  "CVK60D": { w: 60, d: 22, h: 38 },
  "CVK60S": { w: 60, d: 22, h: 38 },

  // CVL — CVL 3D spec update on Sep 26th.pdf
  "CVL20": { w: 20.2, d: 15.6, h: 34.1 },
  "CVL24": { w: 24.1, d: 18.3, h: 34.2 },
  "CVL30": { w: 30, d: 18.3, h: 34.2 },
  "CVL36": { w: 36, d: 22, h: 38 },
  "CVL42": { w: 42, d: 22, h: 38 },
  "CVL48": { w: 48, d: 22, h: 38 },
  "CVL72": { w: 72, d: 22, h: 38 },
  "CVL-LC": { w: 21, d: 17, h: 72 },
  "CVL-TC": { w: 24, d: 8, h: 33 },
  "CVL60D": { w: 60, d: 22, h: 38 },
  "CVL60S": { w: 60, d: 22, h: 38 },

  // CVM — CVM 3D spec - Dec 23rd Ver 1.0.pdf
  "CVM36": { w: 36, d: 22, h: 38 },
  "CVM42": { w: 42, d: 22, h: 38 },
  "CVM48": { w: 48, d: 22, h: 38 },
  "CVM60S": { w: 60, d: 22, h: 38 },
  "CVM72D": { w: 72, d: 22, h: 38 },
  "CVM84D": { w: 84, d: 22, h: 38 },

};
