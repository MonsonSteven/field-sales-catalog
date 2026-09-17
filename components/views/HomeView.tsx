"use client";
// Presentational home view — category tiles. Shared by the online SSR page
// (app/(frontend)/page.tsx) and the offline shell (app/(frontend)/~app/page.tsx), so
// online and offline show the SAME tiles.
//
// Client component since 2026-08-06: the non-core categories sit behind a toggle
// (see lib/home-config.ts for the decision and the allowlist). Props are plain
// serializable data, so the SSR page passes straight through.
import { useMemo, useState } from "react";
import type { CategorySummary } from "@/lib/helpers";
import { partitionHomeTiles } from "@/lib/home-config";
import OfflineImg from "@/components/OfflineImg";

/** An extra, non-Payload tile (e.g. the static "Lowe's" toilet section). Its image is a
 *  same-origin /public asset rather than a Blob URL, so it renders with a plain <img>. */
export interface ExtraTile {
  name: string;
  count: number;
  href: string;
  sample: string | null; // same-origin /public image
}

interface Tile extends ExtraTile {
  local: boolean; // true → same-origin /public image, skip the OfflineImg heal
}

export default function HomeView({
  categories,
  total,
  extra = [],
}: {
  categories: CategorySummary[];
  total: number;
  extra?: ExtraTile[];
}) {
  const [showGated, setShowGated] = useState(false); // resets every visit, by design

  const { primary, gated } = useMemo(() => {
    const tiles: Tile[] = [
      ...categories.map((c) => ({ name: c.name, count: c.count, href: `/category/${c.slug}`, sample: c.sample, local: false })),
      ...extra.map((e) => ({ ...e, local: true })),
    ];
    return partitionHomeTiles(tiles);
  }, [categories, extra]);

  const shown = showGated ? [...primary, ...gated] : primary;

  // With everything revealed, report the whole published catalog (`total` counts products
  // even if one ever lacked a category, so it is the truer number there). Gated, the only
  // honest count is what the visible tiles actually add up to.
  const totalCount = showGated ? total + extra.reduce((s, e) => s + e.count, 0) : shown.reduce((s, t) => s + t.count, 0);

  return (
    <>
      <div className="crumb">Home</div>
      <h1 className="page-title">Browse the Catalog</h1>
      <p className="page-sub">
        {totalCount} products across {shown.length} categories
      </p>

      {gated.length > 0 && (
        <label
          title={`${gated.map((g) => g.name).join(", ")} — hidden by default`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 13, color: "var(--muted)", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={showGated}
            onChange={(e) => setShowGated(e.target.checked)}
            style={{ accentColor: "var(--brand)", cursor: "pointer" }}
          />
          Show additional categories
        </label>
      )}

      <div className="tiles">
        {shown.map((t) => (
          <a key={t.href} href={t.href} className="tile">
            {t.sample ? (
              t.local ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.sample} alt={t.name} />
              ) : (
                <OfflineImg src={t.sample} alt={t.name} />
              )
            ) : null}
            <div className="tile-overlay">
              <div className="t-name">{t.name}</div>
              <div className="t-count">{t.count} products</div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
