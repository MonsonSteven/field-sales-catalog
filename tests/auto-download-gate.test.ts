// shouldAutoDownload — the decision to auto-start the offline download unprompted.
//
// The point of the feature is that a NON-technical rep never has to think about it, so
// the risky direction is a FALSE POSITIVE that burns a metered connection. These tests
// pin both directions: it fires on the cases that matter (online, incomplete, wifi OR
// the iOS "no connection info" case) and stands down on every positive metered/slow
// signal. If someone later tightens the wifi gate, the iOS case (connection == null →
// still true) is the one that must not regress — that is the actual rep device.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { shouldAutoDownload } from "../lib/auto-download-gate";

describe("shouldAutoDownload", () => {
  test("stands down when offline — nothing to fetch", () => {
    assert.equal(shouldAutoDownload({ online: false, complete: false, connection: null }), false);
    // even on wifi, offline means no.
    assert.equal(shouldAutoDownload({ online: false, complete: false, connection: { type: "wifi" } }), false);
  });

  test("stands down when the catalog is already fully cached", () => {
    assert.equal(shouldAutoDownload({ online: true, complete: true, connection: null }), false);
    assert.equal(shouldAutoDownload({ online: true, complete: true, connection: { type: "wifi" } }), false);
  });

  test("iOS Safari (no Network Information API) still auto-downloads — the whole point", () => {
    // navigator.connection is undefined/null on the real rep device; absence of a
    // signal must NOT be read as "unsafe". This is the case the feature exists for.
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: null }), true);
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: undefined }), true);
  });

  test("fires on wifi / ethernet / unknown link types", () => {
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: { type: "wifi" } }), true);
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: { type: "ethernet" } }), true);
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: { type: "unknown" } }), true);
  });

  test("stands down on an explicit cellular connection type", () => {
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: { type: "cellular" } }), false);
  });

  test("respects Save-Data regardless of link type", () => {
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: { saveData: true } }), false);
    assert.equal(
      shouldAutoDownload({ online: true, complete: false, connection: { saveData: true, type: "wifi" } }),
      false,
    );
  });

  test("stands down on a 2g-class effectiveType, proceeds on faster", () => {
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: { effectiveType: "slow-2g" } }), false);
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: { effectiveType: "2g" } }), false);
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: { effectiveType: "3g" } }), true);
    assert.equal(shouldAutoDownload({ online: true, complete: false, connection: { effectiveType: "4g" } }), true);
  });
});
