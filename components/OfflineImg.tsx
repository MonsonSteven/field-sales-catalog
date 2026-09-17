"use client";

// React-owned offline image. Fixes iOS installed-PWA offline images: iOS doesn't
// route <img> loads through the SW cache offline (both crossorigin + plain <img>
// FAIL), but fetch() DOES reach the cache and a blob: <img> renders (proven via
// on-device diagnostics 2026-07-29). So we fetch the same URL (served from the SW
// cache offline), turn it into a same-origin blob: URL, and keep it in React state
// — so a re-render can't clobber it (the reason the imperative global healer failed).
//
// CRITICAL: healing is driven PROACTIVELY, not only from onError. In an installed
// iOS PWA a broken subresource can show the "?" WITHOUT firing a DOM error event
// (the load silently stalls) — so an onError-only heal never runs and the image
// stays broken. Instead, shortly after mount we check whether the native <img>
// actually loaded (complete && naturalWidth > 0); if not, we heal. onError stays as
// the fast path. Online this is a no-op: the image loads well within the delay, the
// check passes, and we never fetch a blob.
import { useCallback, useEffect, useRef, useState } from "react";

// Heal ANY absolute remote image (http/https) — NOT gated to a specific host.
// The catalog's images can be on Vercel Blob OR the partner CDN (Shopify), depending
// on whether a re-sync has reverted them since the last /tools/mirror run. Gating the
// heal to the Blob host silently skipped Shopify-hosted images offline (the cause of
// the long offline-image bug). The fetch→blob recovery works regardless of host, so
// we drive it for every remote image and let the browser/SW cache serve it offline.
const isRemote = (s: string) => /^https?:\/\//i.test(s);
// How long to give the native <img> to load before we assume it silently stalled
// and heal via fetch→blob. Online, cached/Blob images resolve far faster than this,
// so the proactive check no-ops. Offline, this is the deterministic recovery path.
const HEAL_AFTER_MS = 1500;

// Clean "No image" fallback shown when an image genuinely can't be produced — heal
// failed because it's uncached offline, was evicted under storage pressure, or the
// Blob URL is dead. Auto-download (lib/auto-download-gate) prevents the COMMON case
// (rep never tapped Download); this is the safety net for what prevention can't reach,
// so a rep sees a tidy tile instead of a broken "?" box in front of a customer. Kept as
// a same-origin data: URI so it stays an <img> — every call site's layout/object-fit CSS
// keeps working, and it can't itself error into a loop. Neutral gray, no brand color.
const NO_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>" +
      "<rect width='100%' height='100%' fill='#eef1f5'/>" +
      "<text x='50%' y='50%' fill='#9aa5b1' font-family='system-ui,-apple-system,sans-serif' " +
      "font-size='34' text-anchor='middle' dominant-baseline='central'>No image</text></svg>",
  );

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "crossOrigin"> & {
  src: string | null | undefined;
};

export default function OfflineImg({ src, alt, ...rest }: Props) {
  const [resolved, setResolved] = useState<string | undefined>(src ?? undefined);
  const [failed, setFailed] = useState(false);
  const objRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // The src we've already healed (or are healing) — prevents double-fetch when both
  // onError and the proactive timer fire for the same image.
  const healingFor = useRef<string | null>(null);

  const heal = useCallback(async () => {
    const s = typeof src === "string" ? src : "";
    if (!s || s.startsWith("blob:") || !isRemote(s)) return; // heal any remote image (Blob OR Shopify)
    if (healingFor.current === s) return; // already healed / in flight for this src
    healingFor.current = s;
    try {
      const res = await fetch(s, { mode: "cors" }); // hits the SW cache offline
      if (!res.ok) {
        healingFor.current = null; // allow a later retry
        setFailed(true); // dead/missing image (e.g. 404 Blob) — show the clean placeholder
        return;
      }
      const objUrl = URL.createObjectURL(await res.blob());
      if (objRef.current) URL.revokeObjectURL(objRef.current);
      objRef.current = objUrl;
      setFailed(false);
      setResolved(objUrl); // React re-renders <img src=blob:> — survives future renders
    } catch {
      healingFor.current = null; // offline AND not cached — allow a later retry…
      setFailed(true); // …but show "No image" now instead of the broken "?" box
    }
  }, [src]);

  // Follow src changes (e.g. gallery navigation); revoke any prior blob URL + reset.
  useEffect(() => {
    if (objRef.current) {
      URL.revokeObjectURL(objRef.current);
      objRef.current = null;
    }
    healingFor.current = null;
    setFailed(false);
    setResolved(src ?? undefined);
  }, [src]);

  // Proactive heal: if the native <img> hasn't genuinely loaded shortly after mount
  // (covers the iOS case where onError never fires), fetch→blob. No-op if it loaded.
  useEffect(() => {
    const t = setTimeout(() => {
      const im = imgRef.current;
      if (im && im.complete && im.naturalWidth > 0) return; // native load succeeded
      void heal();
    }, HEAL_AFTER_MS);
    return () => clearTimeout(t);
  }, [src, heal]);

  useEffect(
    () => () => {
      if (objRef.current) URL.revokeObjectURL(objRef.current);
    },
    [],
  );

  // A null/blank src is itself "no image" (e.g. a product Artisan Bath Co. shipped with no
  // photo). Every current caller guards this, so it's inert today — but it makes the
  // placeholder airtight against any future unguarded use, same tile in every case.
  const showPlaceholder = failed || !(typeof src === "string" && src.trim() !== "");
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imgRef} src={showPlaceholder ? NO_IMAGE : resolved} alt={alt} onError={() => void heal()} {...rest} />;
}
