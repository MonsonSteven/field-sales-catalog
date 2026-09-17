"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      className="header-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
        if (!t) return;
        const dest = `/search?q=${encodeURIComponent(t)}`;
        // In the offline shell (/~app) route client-side via the hash so search
        // works with no network; on the normal SSR pages use Next navigation.
        if (typeof window !== "undefined" && window.location.pathname === "/~app") {
          window.location.hash = "#" + dest;
        } else {
          router.push(dest);
        }
      }}
    >
      <input
        type="search"
        placeholder="Search all products by name or SKU…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search all products"
      />
      <button type="submit">Search</button>
    </form>
  );
}
