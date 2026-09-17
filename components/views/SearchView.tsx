// Presentational search results view. Shared by the online SSR page and the
// offline shell.
import { formatUSD, type CatalogItem } from "@/lib/helpers";
import OfflineImg from "@/components/OfflineImg";

export default function SearchView({ q, results }: { q: string; results: CatalogItem[] }) {
  return (
    <>
      <div className="crumb">
        <a href="/">Home</a> / Search
      </div>
      <h1 className="page-title">{q ? `Results for “${q}”` : "Search"}</h1>
      <p className="page-sub">
        {q
          ? `${results.length} product${results.length === 1 ? "" : "s"}`
          : "Type a product name or SKU in the search bar above."}
      </p>

      {q && results.length === 0 ? (
        <div className="empty">No products match “{q}”. Try a different name or SKU.</div>
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
                <div className="price">
                  <span className="label">Starting at</span>
                  <span className="amt">{formatUSD(p.price)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
