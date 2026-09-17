"use client";

import { useEffect, useState } from "react";
import { formatStockAsOfDate, formatStockAge } from "@/lib/catalog-shared";

/**
 * Rep-facing "how fresh is this?" line, shown under the price/selection block.
 *
 * Availability is the only field in Artisan Bath Co.'s feed that moves daily, and the sold-out
 * guardrails (greyed options, disabled Add-to-Estimate) can only be as right as the last
 * sync. This makes the age visible so a rep can judge rather than be quietly wrong.
 *
 * DELIBERATELY split across two renders to be hydration-safe: the ABSOLUTE date is
 * deterministic and renders immediately (server + client agree), while the RELATIVE age
 * depends on `Date.now()` and is filled in after mount. Rendering the relative phrase on the
 * server would mismatch every time a day boundary fell between the server render and the
 * client's clock — and this app is verified for a clean console.
 *
 * Rep-facing ONLY. This is deliberately NOT on the customer-facing Product Estimate Sheet:
 * internal data-freshness is our business, and it would invite questions mid-pitch.
 */
export default function DataFreshness({ value }: { value: string | number | null | undefined }) {
  const date = formatStockAsOfDate(value);
  const [age, setAge] = useState<ReturnType<typeof formatStockAge>>(null);

  useEffect(() => {
    setAge(formatStockAge(value));
  }, [value]);

  if (!date) return null;

  return (
    <p className={"stock-asof" + (age?.stale ? " stale" : "")}>
      <span className="stock-asof-label">Stock &amp; pricing as of</span> {date}
      {age ? <span className="stock-asof-age"> · {age.phrase}</span> : null}
      {age?.stale ? <span className="stock-asof-warn"> — confirm availability before quoting</span> : null}
    </p>
  );
}
