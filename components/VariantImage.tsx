"use client";

// Slice 1c plumbing: lets the in-place VariantSelector tell the Gallery which photo to
// show, without moving the whole info column into a client component. The provider wraps
// `.detail` in ProductView and accepts server-rendered children, so the existing layout
// (CSS grid: gallery | info) is untouched — a Fragment adds no DOM nodes.
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import Gallery from "@/components/Gallery";
import { orderGalleryForVariant, lookupVanityDimensions, lookupSpecSheet } from "@/lib/catalog-shared";
import { displaySku } from "@/lib/helpers";

// The SKU rides along with the image so the gallery can also group the selected
// variant's OTHER photos (the supplier often gives one variant 5-6 shots). Image alone isn't
// enough — it identifies the hero, not the set.
type Ctx = { image: string | null; sku: string | null; setImage: (u: string | null, sku?: string | null) => void };
const VariantImageContext = createContext<Ctx>({ image: null, sku: null, setImage: () => {} });

export function VariantImageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ image: string | null; sku: string | null }>({ image: null, sku: null });
  const setImage = useCallback((image: string | null, sku: string | null = null) => setState({ image, sku }), []);
  return (
    <VariantImageContext.Provider value={{ image: state.image, sku: state.sku, setImage }}>
      {children}
    </VariantImageContext.Provider>
  );
}

/** Publish the selected variant's photo + SKU (call from the selector). */
export function useSetVariantImage() {
  return useContext(VariantImageContext).setImage;
}

/** The SKU of the variant currently selected, falling back to the product's own. */
export function VariantSku({ productSku }: { productSku: string | null | undefined }) {
  const { sku } = useContext(VariantImageContext);
  return <>{displaySku(sku, productSku)}</>;
}

/**
 * Overall dimensions for the SELECTED size, reactive like VariantSku: when the rep changes
 * size the number follows (each size is a distinct SKU → distinct sheet value). Renders the
 * exact W×D×H when we have an authoritative sheet value for the current model, otherwise the
 * server-rendered `fallback` (the prose/hedged note) — so uncovered lines are unchanged.
 * Widths carry a real decimal on the small sizes (e.g. 20.2), so numbers render as-is.
 */
export function VariantDimensions({
  productSku,
  fallback,
}: {
  productSku: string | null | undefined;
  fallback: ReactNode;
}) {
  const { sku } = useContext(VariantImageContext);
  const dims = lookupVanityDimensions(sku ?? productSku ?? null);
  if (!dims) return <>{fallback}</>;
  return (
    <>
      {dims.w}″ W × {dims.d}″ D × {dims.h}″ H
    </>
  );
}

/**
 * "Spec Sheet" button — opens the manufacturer's PDF for the SELECTED size/finish in a new tab
 * (native iOS viewer → share/print/save). Reactive like VariantSku: follows the rep's selection,
 * since the supplier ships a distinct sheet per size (and per finish on some lines). Renders NOTHING when
 * we have no sheet for the current model — no dead button. Served same-origin (/specs/…) so the
 * service worker caches it for offline. Not a price, so presentation mode leaves it visible.
 */
export function VariantSpecSheet({ productSku }: { productSku: string | null | undefined }) {
  const { sku } = useContext(VariantImageContext);
  const href = lookupSpecSheet(sku ?? productSku ?? null);
  if (!href) return null;
  return (
    <div style={{ textAlign: "center", marginTop: 16 }}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          padding: "12px 32px",
          borderRadius: 10,
          background: "var(--brand)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M14 2v6h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        Spec Sheet
      </a>
    </div>
  );
}

/**
 * Gallery that leads with the selected variant's photo, then that variant's OTHER photos,
 * then everything else in the supplier's original order. Nothing is ever dropped — a rep can still
 * browse the full set (see orderGalleryForVariant for why we order rather than filter).
 * Falls back to the plain gallery when the variant has no photo (~3% of the supplier variants) or
 * nothing is selected yet.
 */
export function SelectionGallery({ images, title }: { images: string[]; title: string }) {
  const { image, sku } = useContext(VariantImageContext);
  const effective = image || sku ? orderGalleryForVariant(images, image, sku) : images;
  return <Gallery images={effective} title={title} />;
}
