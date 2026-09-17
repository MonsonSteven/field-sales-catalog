// Data-freshness formatting. Availability is the only field in the partner feed that moves
// daily (proven 2026-08-05: B531-BN read available for us while the supplier had it 7/7 sold out, their
// updatedAt ~18h after our sync), so a rep needs to see how old the answer is.
//
// The interesting risk here is NOT the wording — it's that the timestamp arrives in two
// different formats from the two call sites, and one of them is a trap.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseDataTimestamp,
  formatStockAsOfDate,
  formatStockAge,
  STOCK_STALE_AFTER_DAYS,
} from "../lib/catalog-shared";

const ISO = "2026-08-04T18:31:43.000Z";
const MS = Date.parse(ISO);

describe("parseDataTimestamp — two input shapes, one of them a trap", () => {
  test("ISO string (the server's product.updatedAt)", () => {
    assert.equal(parseDataTimestamp(ISO), MS);
  });

  test("REGRESSION: epoch-ms-as-STRING (the offline snapshot.version) is NOT date-parsed", () => {
    // `getSnapshot()` sets version = String(maxTs). Handing that to Date.parse() reads it as
    // a YEAR, which silently yields a nonsense far-future date instead of the real one — the
    // freshness line would then read as always-fresh, defeating the entire feature.
    assert.equal(parseDataTimestamp(String(MS)), MS);
    assert.equal(parseDataTimestamp(MS), MS);
  });

  test("null / empty / junk → null (so the line simply does not render)", () => {
    for (const v of [null, undefined, "", "   ", "not-a-date", 0, "0", -5])
      assert.equal(parseDataTimestamp(v as any), null, `${JSON.stringify(v)} should be null`);
  });
});

describe("formatStockAsOfDate — deterministic, safe to render on the server", () => {
  test("formats an absolute date", () => {
    // Deliberately absolute: no dependence on "now", so server and client agree and there
    // is no hydration mismatch at a day boundary.
    assert.equal(formatStockAsOfDate(ISO), "Aug 4, 2026");
    assert.equal(formatStockAsOfDate(String(MS)), "Aug 4, 2026");
  });

  test("same output for both input shapes — online and offline read identically", () => {
    assert.equal(formatStockAsOfDate(ISO), formatStockAsOfDate(String(MS)));
  });

  test("unparseable input renders nothing", () => {
    assert.equal(formatStockAsOfDate(null), null);
    assert.equal(formatStockAsOfDate("nonsense"), null);
  });
});

describe("formatStockAge — relative age (client-side only)", () => {
  const at = (days: number) => MS + days * 86_400_000;

  test("today / yesterday / N days ago", () => {
    assert.equal(formatStockAge(ISO, at(0))!.phrase, "today");
    assert.equal(formatStockAge(ISO, at(1))!.phrase, "yesterday");
    assert.equal(formatStockAge(ISO, at(5))!.phrase, "5 days ago");
  });

  test("staleness threshold", () => {
    assert.equal(formatStockAge(ISO, at(0))!.stale, false);
    assert.equal(formatStockAge(ISO, at(STOCK_STALE_AFTER_DAYS - 1))!.stale, false);
    assert.equal(formatStockAge(ISO, at(STOCK_STALE_AFTER_DAYS))!.stale, true);
    assert.equal(formatStockAge(ISO, at(30))!.stale, true);
  });

  test("age is in CALENDAR days, not elapsed 24h periods", () => {
    // REGRESSION (caught 2026-08-05 by looking at real output, NOT by these tests — the
    // originals offset from one instant and were self-consistent). Our sync ran 08-04 13:32;
    // at 08-05 08:00 that is ~19h elapsed, which FLOORS TO 0 and rendered
    // "as of Aug 4 · today" on Aug 5 — contradicting the date printed beside it.
    const syncedAt = Date.parse("2026-08-04T13:32:00-05:00");
    const nextMorning = Date.parse("2026-08-05T08:00:00-05:00");
    const age = formatStockAge(syncedAt, nextMorning)!;
    assert.equal(age.days, 1, "crossing midnight is one calendar day, however few hours");
    assert.equal(age.phrase, "yesterday");
    assert.equal(age.stale, false, "one day old must not cry wolf");
  });

  test("...but a long same-day gap is still 'today'", () => {
    const morning = Date.parse("2026-08-05T07:00:00-05:00");
    const evening = Date.parse("2026-08-05T22:00:00-05:00");
    assert.equal(formatStockAge(morning, evening)!.phrase, "today");
  });

  test("a stale OFFLINE snapshot is flagged — the bigger real-world vector", () => {
    // A rep who downloaded a week ago carries week-old stock no matter how often the server
    // syncs, because the timestamp travels inside their snapshot.
    const age = formatStockAge(String(MS), MS + 7 * 86_400_000)!;
    assert.equal(age.phrase, "7 days ago");
    assert.equal(age.stale, true);
  });

  test("a clock skew into the past never yields a negative age", () => {
    assert.equal(formatStockAge(ISO, MS - 60_000)!.days, 0);
  });

  test("unparseable input → null", () => {
    assert.equal(formatStockAge(null), null);
  });
});
