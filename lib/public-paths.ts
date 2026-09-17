// Which paths skip the edge auth gate — extracted from middleware.ts so it can be tested
// without pulling in `next/server`.
//
// WHY THIS EXISTS AS ITS OWN FILE (2026-08-07). The matching used to run against the RAW
// pathname, so a percent-encoded tilde missed the allowlist entirely:
//     /~app    -> 200          (public, correct)
//     /%7Eapp  -> 307 /login   (same resource, bounced)
// `~` is an unreserved character (RFC 3986 §2.3), so browsers normally send it literally and
// this never bit in practice. But when it does bite it bites in the worst possible place:
// `/~app` IS the offline PWA shell, so the failure mode is a rep with no signal getting
// redirected to a login page that cannot load. Found while trying to view a toilet page
// through an automation tool that encodes tildes.
//
// ⚠ WHAT THIS FIX DOES AND DOES NOT DO — measured against a live server, 2026-08-07:
//     BEFORE:  /~app -> 200      /%7Eapp -> 307 to /login
//     AFTER:   /~app -> 200      /%7Eapp -> 404
// So the auth gate no longer treats two spellings of the same resource differently, which is
// the part that was actually wrong here. It does NOT make `/%7Eapp` work: Next's router does
// not resolve the encoded form to the `/~app` route either, so it 404s one layer further in.
// Making that URL genuinely functional would need a redirect (`/%7Eapp` -> `/~app`), which is
// extra moving parts in an auth gate for a case no real browser produces. Deliberately not
// done — recorded so nobody assumes the encoded URL is supported.

export const PUBLIC_PREFIXES = ["/login", "/~app", "/api", "/admin", "/tools"];

/**
 * The pathname to MATCH against, with percent-encoding resolved — but only when doing so is
 * safe.
 *
 * THE SECURITY CONSTRAINT, stated because this is an auth gate and the reasoning is not
 * obvious: decoding before matching can only ever make MORE paths public, so it has to be
 * impossible to craft an encoded path that (a) decodes to something starting with a public
 * prefix while (b) Next routes the raw form to a different, protected page.
 *
 * For unreserved characters like `~` there is no divergence — `/%7Eapp` and `/~app` are the
 * same resource by definition, which is exactly why this fix is safe.
 *
 * The character that WOULD create a divergence is an encoded slash (`%2F`), since it can
 * invent path segments that the router never saw. So: if decoding changes the number of
 * segments, the decode is refused and matching falls back to the raw pathname. That closes
 * the `%2F` class outright rather than reasoning case-by-case about it.
 *
 * Malformed input (`/%ZZ`) throws in decodeURIComponent; that also falls back to raw.
 */
export function pathnameForMatching(pathname: string): string {
  if (!pathname.includes("%")) return pathname; // the overwhelmingly common case
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return pathname; // malformed escape — match the raw form, i.e. stay protected
  }
  // Refuse any decode that changes the path's SEGMENT STRUCTURE (the %2F class).
  if (decoded.split("/").length !== pathname.split("/").length) return pathname;
  return decoded;
}

/** True when the path is exempt from the auth redirect. */
export function isPublicPath(pathname: string): boolean {
  const p = pathnameForMatching(pathname);
  return PUBLIC_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
}

/** A request for a static file (has a dot in the last path segment, e.g. /sw.js). */
export function isFile(pathname: string): boolean {
  const last = pathnameForMatching(pathname).split("/").pop() || "";
  return last.includes(".");
}
