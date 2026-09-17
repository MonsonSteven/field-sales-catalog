"use client";

import { useState, useEffect, useCallback } from "react";
import OfflineImg from "@/components/OfflineImg";

export default function Gallery({ images, title }: { images: string[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const show = useCallback(
    (i: number) => setIdx((i + images.length) % images.length),
    [images.length]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowRight") show(idx + 1);
      else if (e.key === "ArrowLeft") show(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, idx, show]);

  // No photos at all → show the clean "No image" tile (via OfflineImg's placeholder)
  // instead of a blank box, so an imageless product page never looks broken.
  if (!images.length)
    return (
      <div className="gallery-main">
        <OfflineImg src={undefined} alt={title} />
      </div>
    );

  return (
    <div>
      <button className="gallery-main" onClick={() => { setIdx(0); setOpen(true); }} aria-label="Open image viewer">
        <OfflineImg src={images[0]} alt={title} />
      </button>

      {images.length > 1 && (
        <div className="thumbs">
          {images.map((src, i) => (
            <button key={i} className="thumb-btn" onClick={() => { setIdx(i); setOpen(true); }} aria-label={`View image ${i + 1}`}>
              <OfflineImg src={src} alt={`${title} ${i + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="lightbox" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={`${title} image viewer`}>
          <button className="lb-close" onClick={() => setOpen(false)} aria-label="Close viewer">×</button>
          {images.length > 1 && (
            <button className="lb-nav lb-prev" onClick={(e) => { e.stopPropagation(); show(idx - 1); }} aria-label="Previous image">‹</button>
          )}
          <OfflineImg className="lb-img" src={images[idx]} alt={`${title} ${idx + 1}`} onClick={(e) => e.stopPropagation()} />
          {images.length > 1 && (
            <button className="lb-nav lb-next" onClick={(e) => { e.stopPropagation(); show(idx + 1); }} aria-label="Next image">›</button>
          )}
          <div className="lb-count" onClick={(e) => e.stopPropagation()}>{idx + 1} / {images.length}</div>
        </div>
      )}
    </div>
  );
}
