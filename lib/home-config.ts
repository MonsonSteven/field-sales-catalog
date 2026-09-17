// Which categories the Home screen leads with.
//
// DECISION (CEO, c-suite application review 2026-08-06): Home shows only the three
// categories Summit actually sells in a bathroom remodel — Vanities, LED Mirrors, Toilets.
// The rest (Accessories, Bathtubs, Saunas, Shower Doors) stay one tap away behind a
// toggle, the same shape as "Show base cabinets & add-ons" on the Vanities page.
//
// REVISED (2026-08-07, leadership request via Steven): **Bathtubs promoted to primary.**
// This is a deliberate reversal of one part of the 08-06 call, not a bug fix — recorded as
// such so nobody "restores" the original three later thinking it regressed.
// It is also the most defensible of the four to promote: Bathtubs carries 49 products,
// second only to Vanities, so it never looked thin the way Saunas (2) and Shower Doors (6)
// did — those were the numbers that motivated gating in the first place. Accessories,
// Saunas and Shower Doors stay behind the toggle.
//
// WHY AN ALLOWLIST, not a blocklist of the four: a category Artisan Bath Co. adds later is
// gated until a human promotes it, so nothing new can appear in front of a customer
// unvetted. Same posture as holding new PRODUCTS back for review.
//
// SCOPE — this is a BROWSE gate, not an access gate (Steven's call, 2026-08-06).
// Gated categories stay fully reachable by global search and by direct
// /category/{slug} URL. Nothing becomes unreachable; Home simply stops leading with it.
// NOTE: this is DIFFERENT from hide-by-default base cabinets. Those are NOT a category gate —
// they're incomplete (no top+sink) units that reps must never see, so as of 2026-09 they are
// excluded from search too (see isHiddenByDefault in catalog-shared). Category gating is
// unchanged: a rep can still search "sauna" and find saunas.
//
// To promote or demote a category, edit this one list. Names must match the category
// name EXACTLY as it appears in the catalog data (and lib/lowes LOWES_CATEGORY for the
// static Toilets tile) — a typo would silently hide a tile, so
// tests/home-gating.test.ts pins these against the real category names.
export const HOME_PRIMARY_CATEGORIES = ["Vanities", "Bathtubs", "LED Mirrors", "Toilets"] as const;

export function isPrimaryHomeCategory(name: string): boolean {
  return (HOME_PRIMARY_CATEGORIES as readonly string[]).includes(name);
}

/**
 * Split home tiles into the ones shown by default and the ones behind the toggle.
 * Generic over the tile shape so it serves both Payload-backed CategorySummary tiles
 * and the static ExtraTile, and stays testable without React.
 *
 * Input order is PRESERVED within each group — callers sort by product count before
 * calling, and the primaries then fall out as Vanities → LED Mirrors → Toilets.
 */
export function partitionHomeTiles<T extends { name: string }>(tiles: T[]): { primary: T[]; gated: T[] } {
  const primary: T[] = [];
  const gated: T[] = [];
  for (const t of tiles) (isPrimaryHomeCategory(t.name) ? primary : gated).push(t);
  return { primary, gated };
}
