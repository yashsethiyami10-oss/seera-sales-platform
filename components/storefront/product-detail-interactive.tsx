"use client";

import { useEffect, useState } from "react";
import { preload } from "react-dom";
import { Reveal } from "@/components/ui/reveal";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { ProductPurchasePanel } from "@/components/storefront/product-purchase-panel";
import { cloudinaryUrl, IMAGE_PRESETS } from "@/lib/utils/cloudinary-image";

type Variant = { id: string; size: string; price: number; mrp: number; sku: string; quantity: number; lowStockThreshold: number; images: string[] };

/**
 * Sprint 2 Part 3 — Variant Image Gallery (frozen architecture). Lifts the
 * selected-size state above both the gallery and the purchase panel (which
 * previously managed size selection entirely on its own) so switching size
 * immediately swaps the gallery's hero/thumbnails/active-index — no extra
 * click, same interaction Amazon uses. Falls back to `fallbackImages`
 * (`Product.images`) for a variant that has no dedicated gallery yet.
 */
export function ProductDetailInteractive({
  productId,
  productName,
  brandLine,
  shortDescription,
  categoryName,
  fragranceNotes,
  fallbackImages,
  variants,
  rating,
  reviewCount,
  hsnCode,
  gstRate,
  initialWishlisted,
}: {
  productId: string;
  productName: string;
  brandLine: string;
  shortDescription?: string | null;
  categoryName?: string;
  fragranceNotes?: string | null;
  fallbackImages: string[];
  variants: Variant[];
  rating: number | null;
  reviewCount: number;
  hsnCode: string;
  gstRate: number;
  initialWishlisted: boolean;
}) {
  const [sizeIdx, setSizeIdx] = useState(0);
  const activeVariant = variants[sizeIdx];
  const galleryImages = activeVariant?.images && activeVariant.images.length > 0 ? activeVariant.images : fallbackImages;

  // Sprint 2 Part 10 — preload every OTHER variant's cover + first two
  // gallery images at the same resolution tier the gallery itself renders,
  // so switching size shows an already-warm image instead of a fresh
  // network fetch (no white flash while the new hero loads in).
  useEffect(() => {
    for (const v of variants) {
      const images = v.images && v.images.length > 0 ? v.images : fallbackImages;
      for (const url of images.slice(0, 2)) {
        preload(cloudinaryUrl(url, IMAGE_PRESETS.galleryFrame), { as: "image" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, fallbackImages]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
      <div>
        <ProductGallery images={galleryImages} productName={productName} />
      </div>

      <div id="purchase-panel">
        <Reveal delay={0.05}>
          <p className="muv-text-meta text-xs uppercase tracking-wide mb-3">{brandLine}</p>
          <h1 className="font-display text-white mb-4" style={{ fontWeight: 400, fontSize: "clamp(2rem,4vw,2.8rem)" }}>{productName}</h1>
          {shortDescription && (
            <p className="muv-text-body text-[15px] leading-relaxed mb-8 max-w-md">{shortDescription}</p>
          )}
        </Reveal>

        <ProductPurchasePanel
          productId={productId}
          productName={productName}
          productImage={galleryImages[0]}
          categoryName={categoryName}
          fragranceNotes={fragranceNotes}
          variants={variants}
          rating={rating}
          reviewCount={reviewCount}
          hsnCode={hsnCode}
          gstRate={gstRate}
          initialWishlisted={initialWishlisted}
          sizeIdx={sizeIdx}
          onSizeChange={setSizeIdx}
        />
      </div>
    </div>
  );
}
