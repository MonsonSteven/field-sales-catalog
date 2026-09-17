import type { MetadataRoute } from "next";

// Web app manifest → served at /manifest.webmanifest. Makes the catalog an
// installable PWA (Add to Home Screen on rep iPads) that launches standalone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Summit Catalog",
    short_name: "Summit Catalog",
    description: "Summit Home Improvement product catalog — for field sales reps, works offline.",
    // The installed app opens the client shell directly (not "/"). This keeps the
    // URL and the served HTML consistent offline — the shell then routes entirely
    // client-side (no full-page navigations that would make the SW serve the shell
    // at a mismatched URL, which iOS Safari rejects with a client-side exception).
    start_url: "/~app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#14532d", // Summit blue
    icons: [
      { src: "/summit-logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/summit-logo.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
