// The edge auth gate's path matching.
//
// THE BUG (found 2026-08-07): matching ran against the RAW pathname, so a percent-encoded
// tilde missed the allowlist — `/~app` returned 200 while `/%7Eapp` 307'd to /login. Since
// `/~app` IS the offline PWA shell, the failure mode is a rep with no signal being redirected
// to a login page that cannot load. `~` is unreserved (RFC 3986 §2.3) so browsers normally
// send it literally, which is why it never bit in the field.
//
// THIS IS AN AUTH GATE, so the tests below are deliberately lopsided: a handful confirm the
// fix works, and the rest try to ABUSE it. Widening an exemption is the kind of change where
// the interesting cases are the ones that must still be refused.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isPublicPath, isFile, pathnameForMatching, PUBLIC_PREFIXES } from "../lib/public-paths";

describe("public paths — the exemptions still work as before", () => {
  test("each prefix is public, bare and with a subpath", () => {
    for (const p of PUBLIC_PREFIXES) {
      assert.equal(isPublicPath(p), true, `${p} must be public`);
      assert.equal(isPublicPath(`${p}/anything/deeper`), true, `${p}/… must be public`);
    }
  });

  test("ordinary catalog paths stay protected", () => {
    for (const p of ["/", "/category/vanities", "/product/some-vanity", "/estimate", "/lowes"])
      assert.equal(isPublicPath(p), false, `${p} must NOT be public`);
  });

  test("a prefix must match at a SEGMENT boundary, not as a substring", () => {
    // /apifoo is not /api; /loginsomething is not /login. This was true before and must stay
    // true — the fix widened decoding, not the matching rule.
    assert.equal(isPublicPath("/apifoo"), false);
    assert.equal(isPublicPath("/loginsomething"), false);
    assert.equal(isPublicPath("/adminpanel"), false);
    assert.equal(isPublicPath("/~apple"), false);
  });
});

describe("public paths — THE FIX: percent-encoded tilde", () => {
  test("/%7Eapp is public, exactly like /~app", () => {
    assert.equal(isPublicPath("/~app"), true);
    assert.equal(isPublicPath("/%7Eapp"), true, "the offline shell must not bounce to login");
  });

  test("lowercase %7e too, and deeper offline routes", () => {
    assert.equal(isPublicPath("/%7eapp"), true);
    assert.equal(isPublicPath("/%7Eapp/anything"), true);
  });

  test("other encodings of an exempt path also resolve", () => {
    assert.equal(isPublicPath("/%61pi"), true, "/%61pi decodes to /api");
    assert.equal(isPublicPath("/log%69n"), true, "/log%69n decodes to /login");
  });
});

describe("public paths — the abuse cases, which must STILL be refused", () => {
  // The one character that could genuinely create a divergence between what middleware
  // matches and what Next routes: an encoded slash can invent segments the router never saw.
  // pathnameForMatching refuses any decode that changes the segment count, which closes the
  // whole class rather than reasoning about instances.
  test("an encoded slash cannot manufacture a public prefix", () => {
    assert.equal(pathnameForMatching("/%2F~app"), "/%2F~app", "decode must be REFUSED here");
    assert.equal(isPublicPath("/%2F~app"), false);
    assert.equal(isPublicPath("/secret%2F..%2F~app"), false);
    assert.equal(isPublicPath("/%2Fapi"), false);
  });

  test("a protected path cannot be smuggled in behind an exempt-looking one", () => {
    assert.equal(isPublicPath("/estimate%2F%2E%2E%2Flogin"), false);
    assert.equal(isPublicPath("/category/vanities%2F%2E%2E%2Fapi"), false);
  });

  test("malformed percent-escapes fall back to raw and stay protected", () => {
    // decodeURIComponent throws on these; the catch must not fail open.
    assert.equal(pathnameForMatching("/%ZZ"), "/%ZZ");
    assert.equal(isPublicPath("/%ZZ"), false);
    assert.equal(isPublicPath("/%"), false);
    assert.equal(isPublicPath("/%E0%A4%A"), false);
  });

  test("decoding never makes a genuinely protected path public", () => {
    // Including the encoded form of a protected path: /%65stimate decodes to /estimate,
    // which is protected, so resolving the encoding must not change that either way.
    for (const p of ["/estimate", "/category/bathtubs", "/product/x", "/%65stimate"])
      assert.equal(isPublicPath(p), false, `${p} must stay protected`);
  });
});

describe("pathnameForMatching — the decode policy itself", () => {
  test("paths without % are returned untouched (the common case)", () => {
    assert.equal(pathnameForMatching("/category/vanities"), "/category/vanities");
    assert.equal(pathnameForMatching("/~app"), "/~app");
  });

  test("unreserved characters decode, because they denote the same resource", () => {
    assert.equal(pathnameForMatching("/%7Eapp"), "/~app");
    assert.equal(pathnameForMatching("/%61pi"), "/api");
  });

  test("segment count is the guard, and it is exact", () => {
    assert.equal(pathnameForMatching("/a%2Fb").split("/").length, 2, "refused → still one segment");
    assert.equal(pathnameForMatching("/a/b").split("/").length, 3);
  });
});

describe("isFile — unchanged behaviour, now encoding-aware", () => {
  test("static files are still detected", () => {
    for (const f of ["/sw.js", "/manifest.webmanifest", "/icons/apple-touch-icon.png", "/lowes/battan/0.webp"])
      assert.equal(isFile(f), true, `${f} should read as a file`);
  });

  test("pages are not files", () => {
    for (const p of ["/", "/category/vanities", "/~app", "/estimate"])
      assert.equal(isFile(p), false, `${p} should NOT read as a file`);
  });

  test("an encoded dot resolves the same way", () => {
    assert.equal(isFile("/sw%2Ejs"), true);
  });
});
