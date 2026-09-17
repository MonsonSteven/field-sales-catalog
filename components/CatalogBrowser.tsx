"use client";

import { useMemo, useState } from "react";
import { formatUSD, type CatalogItem, type FilterDef } from "@/lib/helpers";
import { itemMatchesQuery, isHiddenByDefault, soldOutRank } from "@/lib/catalog-shared";
import { usePriceHidden } from "@/lib/price-visibility";
import OfflineImg from "@/components/OfflineImg";

type Selected = Record<string, string[]>;
type Sort = "price-asc" | "price-desc" | "name";

function valuesOf(item: CatalogItem, key: string): string[] {
  const v = item.attributes[key];
  if (v == null) return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

export default function CatalogBrowser({
  items,
  filters,
  categoryName,
}: {
  items: CatalogItem[];
  filters: FilterDef[];
  categoryName: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("price-asc");
  const [selected, setSelected] = useState<Selected>({});
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const priceHidden = usePriceHidden(); // presentation mode: hide the price filter + $ chips too
  // Base/add-on units (hide_by_default) are never shown to reps — no reveal toggle (leadership, 2026-09).
  // They stay in Payload untouched; they're simply filtered out of the browse.

  const bounds = useMemo(() => {
    const ps = items.map((i) => i.price).filter((n): n is number => n != null);
    return { min: ps.length ? Math.floor(Math.min(...ps)) : 0, max: ps.length ? Math.ceil(Math.max(...ps)) : 0 };
  }, [items]);

  const results = useMemo(() => {
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;

    let out = items.filter((item) => {
      if (isHiddenByDefault(item)) return false; // base/add-on units are never shown to reps
      if (!itemMatchesQuery(item, query)) return false; // name/SKU/size/colour, unit-normalized
      if (min != null && (item.price == null || item.price < min)) return false;
      if (max != null && (item.price == null || item.price > max)) return false;
      for (const [key, vals] of Object.entries(selected)) {
        if (!vals.length) continue;
        const iv = valuesOf(item, key);
        if (!vals.some((v) => iv.includes(v))) return false; // AND across groups, OR within
      }
      return true;
    });

    out = out.slice().sort((a, b) => {
      // Sold-out tiles always sink to the bottom, whatever sort is chosen — reps see what they
      // can actually sell first. Within each group, the chosen sort applies.
      const avail = soldOutRank(a) - soldOutRank(b);
      if (avail !== 0) return avail;
      if (sort === "name") return a.title.localeCompare(b.title);
      const pa = a.price ?? Infinity;
      const pb = b.price ?? Infinity;
      return sort === "price-desc" ? pb - pa : pa - pb;
    });
    return out;
  }, [items, query, selected, priceMin, priceMax, sort]);

  function toggle(key: string, value: string) {
    setSelected((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      const copy = { ...prev };
      if (next.length) copy[key] = next;
      else delete copy[key];
      return copy;
    });
  }

  function clearAll() {
    setSelected({});
    setPriceMin("");
    setPriceMax("");
  }

  const activeChips: Array<{ label: string; onRemove: () => void }> = [];
  for (const f of filters) {
    for (const v of selected[f.key] ?? []) {
      activeChips.push({ label: `${f.label}: ${v}`, onRemove: () => toggle(f.key, v) });
    }
  }
  if (!priceHidden) {
    // In presentation mode the price filter is hidden, so don't surface its $ chips either.
    if (priceMin) activeChips.push({ label: `Min ${formatUSD(Number(priceMin))}`, onRemove: () => setPriceMin("") });
    if (priceMax) activeChips.push({ label: `Max ${formatUSD(Number(priceMax))}`, onRemove: () => setPriceMax("") });
  }

  const rail = (
    <aside className={`filter-rail${drawerOpen ? " open" : ""}`}>
      <div className="rail-header">
        <span>Filters</span>
        <button className="rail-close" onClick={() => setDrawerOpen(false)} aria-label="Close filters">
          ×
        </button>
      </div>

      <div className="filter-group price-private">
        <div className="filter-group-title">Price</div>
        <div className="price-inputs">
          <input
            type="number"
            inputMode="numeric"
            placeholder={String(bounds.min)}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            aria-label="Minimum price"
          />
          <span>–</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder={String(bounds.max)}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            aria-label="Maximum price"
          />
        </div>
      </div>

      {filters.map((f) => (
        <div className="filter-group" key={f.key}>
          <div className="filter-group-title">{f.label}</div>
          <div className={`filter-list${f.options.length > 8 ? " scroll" : ""}`}>
            {f.options.map((opt) => {
              const checked = (selected[f.key] ?? []).includes(opt);
              return (
                <label className="filter-check" key={opt}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(f.key, opt)} />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );

  return (
    <>
      <div className="toolbar">
        <button className="btn-filters" onClick={() => setDrawerOpen(true)}>
          ☰ Filters{activeChips.length ? ` (${activeChips.length})` : ""}
        </button>
        <input
          className="search-input"
          type="search"
          placeholder={`Search ${categoryName.toLowerCase()} by name, SKU, size, or color…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="name">Name: A–Z</option>
        </select>
        <span className="result-count">{results.length} products</span>
      </div>

      {activeChips.length > 0 && (
        <div className="chips">
          {activeChips.map((c, i) => (
            <button className="chip" key={i} onClick={c.onRemove}>
              {c.label} <span className="chip-remove">×</span>
            </button>
          ))}
          <button className="clear-all" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}

      <div className="catalog-layout">
        {rail}
        {drawerOpen && <div className="rail-overlay" onClick={() => setDrawerOpen(false)} />}

        <div className="catalog-main">
          {results.length === 0 ? (
            <div className="empty">No products match these filters. Try clearing a few.</div>
          ) : (
            <div className="grid">
              {results.map((p) => (
                <a key={p.slug} href={`/product/${p.slug}`} className="card">
                  <div className={`card-img${p.soldOut ? " is-soldout" : ""}`}>
                    {p.image ? (
                      <OfflineImg src={p.image} alt={p.title} loading="lazy" />
                    ) : (
                      <span className="ph">No image</span>
                    )}
                    {p.soldOut ? <span className="soldout-badge">Sold out</span> : null}
                  </div>
                  <div className="card-body">
                    <div className="card-cat">{p.category}</div>
                    <div className="card-title">{p.title}</div>
                    {p.groupCount && p.groupCount > 1 ? (
                      <div
                        className="card-sizes"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", margin: "2px 0 0" }}
                      >
                        {p.groupCount} sizes available
                      </div>
                    ) : null}
                    <div className="price">
                      <span className="label">Starting at</span>
                      <span className="amt">{formatUSD(p.price)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
