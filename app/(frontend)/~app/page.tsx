"use client";

// Offline app shell — the installed PWA's entry point (manifest start_url).
//
// Routing is HASH-based on purpose: the URL path stays "/~app" and the current
// view lives in the hash (e.g. /~app#/product/foo). That means:
//   • the service worker always serves the SAME precached /~app document, so there
//     is never a "shell HTML served at a mismatched path" crash (iOS Safari is
//     strict about this, and reloads backgrounded PWAs aggressively);
//   • navigation is fully client-side — no full-page loads that would hit the SW
//     with a path it must fake.
// A capture-phase click interceptor turns the shared views' plain <a href="/…">
// links into hash navigations, so the same components work online and offline.
import { useEffect, useState } from "react";
import {
  useCatalog,
  deriveCategories,
  categoryBySlug,
  itemsByCategorySlug,
  filterDefsForCategory,
  productBySlug,
  productBySourceId,
  attrDefsForCategory,
  searchItems,
} from "@/lib/catalog-source";
import { buildConfigurator, computeBrowseGroups, applyBrowseGroups } from "@/lib/catalog-shared";
import HomeView, { type ExtraTile } from "@/components/views/HomeView";
import CategoryView from "@/components/views/CategoryView";
import ProductView from "@/components/views/ProductView";
import SearchView from "@/components/views/SearchView";
import EstimateView from "@/components/views/EstimateView";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ maxWidth: 560, margin: "6vh auto", textAlign: "center", padding: "0 20px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/summit-logo.svg" alt="Summit Home Improvement" style={{ width: 140, marginBottom: 20 }} />
      <h1 style={{ fontFamily: "var(--font-heading)", color: "#14532d", fontSize: 24, margin: "0 0 10px" }}>{title}</h1>
      <p style={{ color: "#444", fontSize: 15, lineHeight: 1.5 }}>{body}</p>
    </div>
  );
}

/** Parse the hash "#/category/foo?x=y" → { path, q (search term), sid (product recovery id) } */
function parseHash(): { path: string; q: string; sid: string } {
  const raw = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  return { path: path || "/", q: params.get("q") ?? "", sid: params.get("sid") ?? "" };
}

export default function OfflineAppShell() {
  const { loading, snapshot, status } = useCatalog();
  const [route, setRoute] = useState<{ path: string; q: string; sid: string }>({ path: "/", q: "", sid: "" });

  // Online + not signed in (server returned 401 with nothing cached) → go log in.
  // This can only be reached ONLINE: offline the network fetch throws and is caught
  // as "offline"/cached, never "unauthorized" — so a signed-in rep with downloaded
  // data is never bounced to login without signal (the locked offline-tolerant rule).
  useEffect(() => {
    if (!loading && status === "unauthorized") {
      window.location.assign("/login?redirect=/~app");
    }
  }, [loading, status]);

  useEffect(() => {
    const sync = () => setRoute(parseHash());
    sync();
    window.addEventListener("hashchange", sync);

    // Turn internal <a href="/…"> clicks into hash navigation (no full page load).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return; // internal paths only
      const target = anchor.getAttribute("target");
      if (target && target !== "_self") return;
      e.preventDefault();
      const next = "#" + href;
      if (window.location.hash !== next) {
        window.location.hash = next; // fires hashchange → sync()
        window.scrollTo(0, 0);
      }
    };
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("hashchange", sync);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  if (loading) return <p className="page-sub">Loading…</p>;

  if (!snapshot) {
    return (
      <Notice
        title="Nothing saved for offline yet"
        body="Connect to the internet and open the catalog once — it’ll download automatically so you can browse it offline afterward."
      />
    );
  }

  const products = snapshot.products;
  const attrDefs = snapshot.attributeDefinitions;
  const { path, q, sid } = route;

  const prod = path.match(/^\/product\/(.+)$/);
  if (prod) {
    // Slug first; then recover a the supplier-renamed product by the stable source id an estimate line carries.
    const p = productBySlug(products, decodeURIComponent(prod[1])) ?? productBySourceId(products, sid);
    if (!p) return <Notice title="Not available offline" body="This product isn’t in your downloaded catalog. Reconnect to view it." />;
    return (
      <ProductView
        product={p}
        defs={attrDefsForCategory(attrDefs, p.category)}
        configurator={buildConfigurator(p, products)}
        // From THIS DEVICE's snapshot, so the age shown is the age of the data the rep
        // actually has offline — not the server's.
        dataAsOf={snapshot.version}
      />
    );
  }

  const cat = path.match(/^\/category\/(.+)$/);
  if (cat) {
    const slug = decodeURIComponent(cat[1]);
    const category = categoryBySlug(products, slug);
    if (!category) return <Notice title="Not available offline" body="This category isn’t in your downloaded catalog. Reconnect to view it." />;
    // Same grouping as the online category page (computeBrowseGroups/applyBrowseGroups), fed the
    // full snapshot set this device holds — so the offline grid collapses identically to online.
    const categoryItems = applyBrowseGroups(itemsByCategorySlug(products, slug), computeBrowseGroups(products));
    return (
      <CategoryView
        category={category}
        items={categoryItems}
        // items passed so dead filters (orphaned attribute defs) are dropped — must match
        // the server's getFilterDefs so online and offline render identically.
        filters={filterDefsForCategory(attrDefs, category.name, categoryItems)}
      />
    );
  }

  if (path === "/search") {
    return <SearchView q={q} results={q ? searchItems(products, q) : []} />;
  }

  // Product Estimate review — reads the on-device estimate store (works offline).
  if (path === "/estimate") {
    return <EstimateView />;
  }

  // "/" or the shell's own "/~app" path → home.
  return <HomeView categories={deriveCategories(products)} total={products.length} />;
}
