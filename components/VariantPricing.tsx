import { formatUSD } from "@/lib/helpers";

interface CombinedVariant {
  sku: string | null;
  customerPrice: number | null;
  optionValues: Record<string, string>;
}

/**
 * Renders variant pricing intelligently:
 *  - 2 option axes  -> compact price MATRIX (rows × columns)
 *  - 1 axis (or 3+) -> responsive multi-column list
 *  - <=1 priced variant -> nothing (the price box already covers it)
 */
export default function VariantPricing({
  variants,
  labels,
}: {
  variants: CombinedVariant[];
  labels: Record<string, string>;
}) {
  const priced = variants.filter((v) => v.customerPrice != null);
  if (priced.length <= 1) return null;

  const labelFor = (k: string) =>
    labels[k] || k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const distinct = (k: string) =>
    [...new Set(priced.map((v) => v.optionValues[k]).filter(Boolean))];

  const keys = [...new Set(priced.flatMap((v) => Object.keys(v.optionValues)))];
  const axes = keys.filter((k) => distinct(k).length >= 2);

  // ---- 2-axis matrix ----
  if (axes.length === 2) {
    const [rowKey, colKey] = axes.slice().sort((a, b) => distinct(b).length - distinct(a).length);
    const rows = distinct(rowKey).sort();
    const cols = distinct(colKey).sort();
    const priceAt = (r: string, c: string) =>
      priced.find((v) => v.optionValues[rowKey] === r && v.optionValues[colKey] === c)?.customerPrice ?? null;

    return (
      <div className="price-private">
        <div className="section-label">Options &amp; pricing</div>
        <div className="matrix-meta">
          Rows: <strong>{labelFor(rowKey)}</strong> · Columns: <strong>{labelFor(colKey)}</strong>
        </div>
        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th className="corner" />
                {cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r}>
                  <th>{r}</th>
                  {cols.map((c) => {
                    const p = priceAt(r, c);
                    return (
                      <td key={c} className={p == null ? "na" : "amt"}>
                        {p == null ? "—" : formatUSD(p)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---- single-axis (or 3+): responsive multi-column list ----
  return (
    <div className="price-private">
      <div className="section-label">Options &amp; pricing</div>
      <ul className="variant-cols">
        {priced.map((v) => (
          <li key={v.sku}>
            <span className="v-opt">{Object.values(v.optionValues).join(" · ") || v.sku}</span>
            <span className="v-amt">{formatUSD(v.customerPrice)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
