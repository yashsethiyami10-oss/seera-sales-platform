"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Star, ShoppingBag, Eye } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/components/ui/toast";
import { addToWishlist, removeFromWishlist } from "@/actions/wishlist";
import { Reveal } from "@/components/ui/reveal";
import { ProductImage } from "@/components/storefront/product-image";
import { IMAGE_PRESETS } from "@/lib/utils/cloudinary-image";
import { calculateDiscountPercent } from "@/lib/utils/discount";
import { getStockStatus, STOCK_STATUS_LABEL } from "@/lib/utils/stock-status";
import { QuickViewModal } from "@/components/storefront/quick-view-modal";

export type FeaturedProduct = {
  id: string;
  name: string;
  slug: string;
  category: { name: string };
  images: string[];
  usp: string | null;
  badge: "New" | "Limited" | null;
  rating: number | null;
  reviewCount: number;
  variant: { id: string; size: string; price: number; mrp: number; quantity: number; lowStockThreshold: number } | null;
};

/**
 * Client-side because the whole point of this section is the interaction —
 * wishlist, add-to-cart, quick view. Mirrors the same actions/hooks
 * ProductGrid already uses (same wishlist actions, same cart context, the
 * exact same QuickViewModal reused unmodified) so this doesn't invent a
 * second, divergent way of doing the same three things.
 */
export function FeaturedProducts({ products, wishlistedIds = [] }: { products: FeaturedProduct[]; wishlistedIds?: string[] }) {
  const [wishlist, setWishlist] = useState<Set<string>>(new Set(wishlistedIds));
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const { addItem } = useCart();
  const { showToast } = useToast();

  async function handleToggleWishlist(p: FeaturedProduct) {
    const isWishlisted = wishlist.has(p.id);
    setWishlist((prev) => {
      const next = new Set(prev);
      isWishlisted ? next.delete(p.id) : next.add(p.id);
      return next;
    });
    const result = isWishlisted ? await removeFromWishlist(p.id) : await addToWishlist({ productId: p.id, variantId: p.variant?.id });
    if (!result.success) {
      setWishlist((prev) => {
        const next = new Set(prev);
        isWishlisted ? next.add(p.id) : next.delete(p.id);
        return next;
      });
      showToast(result.error.message.includes("signed in") ? "Log in to save items to your wishlist" : result.error.message);
    }
  }

  function handleAdd(p: FeaturedProduct) {
    if (!p.variant) return;
    addItem({ variantId: p.variant.id, productId: p.id, name: p.name, size: p.variant.size, price: p.variant.price, mrp: p.variant.mrp, image: p.images[0] });
    showToast(`${p.name} added to cart`);
  }

  const quickViewProduct = products.find((p) => p.id === quickViewId);

  return (
    <>
      {/* Mobile: horizontal scroll-snap row, matching the same pattern
          already used for homepage category tiles and Recently Viewed
          (muv-scroll-row) — previously this was the one comparable
          horizontal list still using a cramped 2-column grid on mobile
          instead. sm+: reverts to the original grid, unchanged. */}
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory muv-scroll-row pb-2 -mx-6 px-6 sm:grid sm:grid-cols-2 sm:overflow-visible sm:mx-0 sm:px-0 lg:grid-cols-3 md:gap-8">
        {products.map((p, i) => {
          const discount = p.variant ? calculateDiscountPercent(p.variant.price, p.variant.mrp) : null;
          const stockStatus = p.variant ? getStockStatus(p.variant.quantity, p.variant.lowStockThreshold) : "OUT_OF_STOCK";
          const isWishlisted = wishlist.has(p.id);

          return (
            <Reveal key={p.id} delay={i * 0.07} className="flex-shrink-0 snap-start w-[min(220px,68vw)] sm:w-auto">
              <div className="muv-featured-card muv-card sm:w-full" style={{ padding: 0, overflow: "hidden" }}>
                <div className="relative">
                  <Link href={`/products/${p.slug}`} className="block muv-product-visual" style={{ aspectRatio: "1 / 1", borderRadius: 0 }}>
                    <div className="muv-featured-card-media" style={{ width: "100%", height: "100%" }}>
                      <ProductImage src={p.images[0]} alt={p.name} transform={IMAGE_PRESETS.thumbnail} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 40vw, 30vw" />
                    </div>
                  </Link>

                  {p.badge && (
                    <span className="muv-featured-badge absolute top-3.5 left-3.5" data-tone={p.badge === "Limited" ? "limited" : undefined}>
                      {p.badge}
                    </span>
                  )}

                  <div className="absolute top-3.5 right-3.5 flex flex-col gap-2">
                    <button
                      onClick={() => handleToggleWishlist(p)}
                      className="muv-icon-circle muv-wishlist-btn"
                      style={{ width: 34, height: 34, background: "rgba(11,11,15,0.55)" }}
                      data-active={isWishlisted}
                      aria-label={isWishlisted ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
                    >
                      <Heart size={14} fill={isWishlisted ? "var(--lavender)" : "none"} color={isWishlisted ? "var(--lavender)" : "#fff"} />
                    </button>
                    <button
                      onClick={() => setQuickViewId(p.id)}
                      className="muv-icon-circle"
                      style={{ width: 34, height: 34, background: "rgba(11,11,15,0.55)" }}
                      aria-label={`Quick view ${p.name}`}
                    >
                      <Eye size={14} color="#fff" />
                    </button>
                  </div>
                </div>

                <div className="muv-featured-card-body p-5 sm:p-6">
                  <div className="muv-featured-card-meta">
                    <p className="muv-text-meta text-[10px] uppercase tracking-widest">{p.category.name}</p>
                    <Link href={`/products/${p.slug}`}>
                      <h3 className="font-display muv-text-solid text-base sm:text-lg" style={{ fontWeight: 500, lineHeight: 1.25 }}>{p.name}</h3>
                    </Link>
                    {p.usp && <p className="muv-text-meta text-xs" style={{ lineHeight: 1.55 }}>{p.usp}</p>}
                  </div>

                  {p.rating != null && (
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, si) => (
                        <Star key={si} size={11} fill={si < Math.round(p.rating!) ? "var(--lavender)" : "none"} color="var(--lavender)" strokeWidth={1.2} />
                      ))}
                      <span className="muv-text-faint text-[11px] ml-1">({p.reviewCount})</span>
                    </div>
                  )}

                  {p.variant && (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="muv-text-solid text-base" style={{ fontWeight: 500 }}>₹{p.variant.price}</span>
                      {discount != null && (
                        <>
                          <span className="muv-text-faint text-xs line-through">₹{p.variant.mrp}</span>
                          <span className="text-xs" style={{ color: "var(--lavender)" }}>{discount}% off</span>
                        </>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => handleAdd(p)}
                    disabled={stockStatus === "OUT_OF_STOCK"}
                    className="muv-featured-add-btn mt-1"
                  >
                    <ShoppingBag size={13} />
                    {stockStatus === "OUT_OF_STOCK" ? STOCK_STATUS_LABEL.OUT_OF_STOCK : "Add to routine"}
                  </button>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      {quickViewProduct && (
        <QuickViewModal
          product={{
            id: quickViewProduct.id,
            name: quickViewProduct.name,
            slug: quickViewProduct.slug,
            category: quickViewProduct.category,
            images: quickViewProduct.images,
            rating: quickViewProduct.rating,
            reviewCount: quickViewProduct.reviewCount,
            variants: quickViewProduct.variant ? [quickViewProduct.variant] : [],
          }}
          onClose={() => setQuickViewId(null)}
        />
      )}
    </>
  );
}
