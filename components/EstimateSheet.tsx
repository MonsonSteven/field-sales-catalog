"use client";

// The customer-facing Product Estimate Sheet — a clean, read-only, Summit-branded
// rendering of an estimate. Serves BOTH:
//   • Slice B (present-to-customer mode): shown on-screen when the rep taps "Present".
//   • Slice C (branded PDF): this is exactly what the browser prints — the @media
//     print rules in globals.css hide the app chrome and leave just this sheet.
// Pure/read-only: no steppers, no remove, no inputs — safe to hand the iPad over.
// Client-only (reads OfflineImg + the passed estimate); works fully offline.
import type { Estimate } from "@/lib/db";
import { estimateSubtotal } from "@/lib/estimate";
import { formatUSD } from "@/lib/helpers";
import { ESTIMATE } from "@/lib/estimate-config";
import OfflineImg from "@/components/OfflineImg";

export default function EstimateSheet({ estimate: est }: { estimate: Estimate }) {
  const dateStr = new Date(est.createdAt).toLocaleDateString();
  const custRows: Array<[string, string]> = [
    ["Customer", est.customerName],
    ["Email", est.customerEmail],
    ["Phone", est.customerPhone],
    ["Prepared by", est.preparedBy],
  ];
  const filledRows = custRows.filter(([, v]) => v && v.trim());

  return (
    <div className="estimate-sheet">
      <div className="es-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="es-logo" src="/summit-logo.svg" alt="Summit Home Improvement" />
        <div className="es-meta">
          <h2 className="es-title">{ESTIMATE.docTitle}</h2>
          <div>{dateStr}</div>
          <div>Valid for {ESTIMATE.validityDays} days</div>
        </div>
      </div>

      {filledRows.length > 0 && (
        <div className="es-cust">
          {filledRows.map(([k, v]) => (
            <div key={k}>
              <div className="k">{k}</div>
              <div className="v">{v}</div>
            </div>
          ))}
        </div>
      )}

      <table className="es-lines">
        <tbody>
          {est.lines.map((l) => (
            <tr className="es-line" key={l.id}>
              <td style={{ width: 56 }}>
                {l.image ? <OfflineImg className="es-thumb" src={l.image} alt={l.title} /> : null}
              </td>
              <td>
                <div style={{ fontWeight: 600 }}>{l.title}</div>
                {(l.variantLabel || l.sku) && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {[l.variantLabel, l.sku].filter(Boolean).join(" · ")}
                  </div>
                )}
              </td>
              <td className="price-private" style={{ textAlign: "right", whiteSpace: "nowrap", color: "var(--muted)", fontSize: 13 }}>
                {formatUSD(l.unitPrice)}
                <div style={{ fontSize: 11 }}>ea</div>
              </td>
              <td style={{ textAlign: "center", whiteSpace: "nowrap", fontWeight: 600 }}>×{l.qty}</td>
              <td className="price-private" style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: "var(--navy)" }}>
                {formatUSD(l.unitPrice * l.qty)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="es-total price-private">
        <span style={{ color: "var(--muted)", fontSize: 14 }}>Product subtotal</span>
        <span className="amt">{formatUSD(estimateSubtotal(est))}</span>
      </div>

      <p className="es-disc">{ESTIMATE.disclaimer}</p>
    </div>
  );
}
