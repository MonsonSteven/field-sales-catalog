"use client";

// Product Estimate review/edit screen. Shared by the online /estimate page and the
// offline /~app shell (reads the on-device store, so it works with no signal).
import { useState } from "react";
import { useEstimate, estimateSubtotal, setLineQty, removeLine, updateFields, productHref, type Estimate } from "@/lib/estimate";
import { formatUSD } from "@/lib/helpers";
import { ESTIMATE } from "@/lib/estimate-config";
import OfflineImg from "@/components/OfflineImg";
import EstimateSheet from "@/components/EstimateSheet";

function Field({
  id,
  label,
  type = "text",
  defaultValue,
  onCommit,
}: {
  id: string;
  label: string;
  type?: string;
  defaultValue: string;
  onCommit: (v: string) => void;
}) {
  return (
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
      {label}
      <input
        id={id}
        type={type}
        defaultValue={defaultValue}
        onBlur={(e) => onCommit(e.target.value)}
        style={{
          display: "block",
          width: "100%",
          height: 38,
          marginTop: 4,
          padding: "0 10px",
          fontSize: 14,
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "#fff",
          color: "var(--ink)",
          boxSizing: "border-box",
        }}
      />
    </label>
  );
}

export default function EstimateView() {
  const { loading, estimate: est } = useEstimate();
  const [mode, setMode] = useState<"edit" | "present">("edit");

  if (loading) return <p className="page-sub">Loading…</p>;

  const empty = !est || est.lines.length === 0;

  // Present-to-customer mode (Slice B): a clean, read-only branded sheet — also the
  // exact thing the browser prints to PDF (Slice C). The toolbar is .no-print.
  if (!empty && mode === "present") {
    return (
      <>
        <div className="est-actions no-print" style={{ marginTop: 16 }}>
          <button onClick={() => setMode("edit")} style={secBtn}>
            ← Back to editing
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => printEstimate(est!)} style={primBtn}>
            Print / Save PDF
          </button>
        </div>
        <EstimateSheet estimate={est!} />
      </>
    );
  }

  return (
    <>
      <div className="crumb">
        <a href="/">Home</a> / {ESTIMATE.featureName}
      </div>
      <h1 className="page-title">{ESTIMATE.featureName}</h1>

      {empty ? (
        <div className="empty">
          No items yet. Browse the catalog and tap <strong>“{ESTIMATE.addVerb}”</strong> on any product to
          start building a {ESTIMATE.docTitle}.
        </div>
      ) : (
        <>
          <p className="page-sub">
            {est!.lines.length} item{est!.lines.length === 1 ? "" : "s"} · builds a {ESTIMATE.docTitle}
          </p>

          <div className="est-actions no-print">
            <button onClick={() => setMode("present")} style={primBtn}>
              Present to customer
            </button>
          </div>

          {/* customer / prepared-by (key by id so uncontrolled inputs reset per estimate) */}
          <div
            key={est!.id}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              background: "#fff",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 16,
              marginBottom: 18,
            }}
          >
            <Field id="cust" label="Customer name" defaultValue={est!.customerName} onCommit={(v) => updateFields(est!.id, { customerName: v })} />
            <Field id="email" label="Customer email" type="email" defaultValue={est!.customerEmail} onCommit={(v) => updateFields(est!.id, { customerEmail: v })} />
            <Field id="phone" label="Customer phone" type="tel" defaultValue={est!.customerPhone} onCommit={(v) => updateFields(est!.id, { customerPhone: v })} />
            <Field id="prep" label="Prepared by" defaultValue={est!.preparedBy} onCommit={(v) => updateFields(est!.id, { preparedBy: v })} />
          </div>

          {/* line items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {est!.lines.map((l) => (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "#fff",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <div style={{ width: 64, height: 64, flexShrink: 0, background: "var(--navy)", borderRadius: 8, overflow: "hidden" }}>
                  {l.image ? (
                    <OfflineImg src={l.image} alt={l.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={productHref(l)} style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14, textDecoration: "none" }}>
                    {l.title}
                  </a>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {[l.variantLabel, l.sku].filter(Boolean).join(" · ")}
                  </div>
                  <div className="price-private" style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600, marginTop: 2 }}>
                    {formatUSD(l.unitPrice)} <span style={{ color: "var(--muted)", fontWeight: 400 }}>ea</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button aria-label="Decrease quantity" onClick={() => setLineQty(est!.id, l.id, l.qty - 1)} style={qtyBtn}>−</button>
                  <span style={{ minWidth: 22, textAlign: "center", fontWeight: 600 }}>{l.qty}</span>
                  <button aria-label="Increase quantity" onClick={() => setLineQty(est!.id, l.id, l.qty + 1)} style={qtyBtn}>+</button>
                </div>
                <div className="price-private" style={{ width: 96, textAlign: "right", fontWeight: 700, color: "var(--navy)" }}>{formatUSD(l.unitPrice * l.qty)}</div>
                <button aria-label="Remove item" onClick={() => removeLine(est!.id, l.id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>

          {/* subtotal */}
          <div className="price-private" style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12, marginTop: 16 }}>
            <span style={{ color: "var(--muted)", fontSize: 14 }}>Product subtotal</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: "var(--navy)" }}>{formatUSD(estimateSubtotal(est))}</span>
          </div>

          <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.5, marginTop: 16, maxWidth: 640, marginLeft: "auto", textAlign: "right" }}>
            {ESTIMATE.disclaimer}
          </p>
        </>
      )}
    </>
  );
}

// The default "Save as PDF" filename (and print-dialog header title) come from
// document.title. Reps need a real name, not "Summit Catalog" — so we set a clean,
// filename-safe title just for the print, then restore it.
function sheetFilename(est: Estimate): string {
  const who = (est.customerName || "Customer").trim();
  const date = new Date(est.createdAt).toISOString().slice(0, 10); // YYYY-MM-DD
  return `Product Estimate - ${who} - ${date}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

function printEstimate(est: Estimate): void {
  const prev = document.title;
  document.title = sheetFilename(est);
  const restore = () => {
    document.title = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
  setTimeout(restore, 2000); // safety net if afterprint doesn't fire (older Safari)
}

const qtyBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  border: "1px solid var(--line)",
  borderRadius: 7,
  background: "#fff",
  color: "var(--ink)",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

const primBtn: React.CSSProperties = {
  height: 40,
  padding: "0 18px",
  border: "none",
  borderRadius: 9,
  background: "var(--navy)",
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const secBtn: React.CSSProperties = {
  height: 40,
  padding: "0 16px",
  border: "1px solid var(--line)",
  borderRadius: 9,
  background: "#fff",
  color: "var(--ink)",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};
