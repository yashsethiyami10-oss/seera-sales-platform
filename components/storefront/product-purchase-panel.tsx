"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Heart, ArrowRight, Star, Share2 } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";
import { addToWishlist, removeFromWishlist } from "@/actions/wishlist";
import { calculateDiscountPercent } from "@/lib/utils/discount";
import { getStockStatus, STOCK_STATUS_LABEL } from "@/lib/utils/stock-status";

type Variant = { id: string; size: string; price: number; mrp: number; sku: string; quantity: number; lowStockThreshold: number };

export function ProductPurchasePanel({
  productId,
  productName,
  productImage,
  categoryName,
  fragranceNotes,
  variants,
  rating,
  reviewCount,
  hsnCode,
  gstRate,
  initialWishlisted = false,
  sizeIdx: controlledSizeIdx,
  onSizeChange,
}: {
  productId: string;
  productName: string;
  productImage?: string;
  categoryName?: string;
  fragranceNotes?: string | null;
  variants: Variant[];
  rating: number | null;
  reviewCount: number;
  hsnCode: string;
  gstRate: number;
  initialWishlisted?: boolean;
  // Sprint 2 Part 3 — Variant Image Gallery: when a parent needs to switch
  // the product photography in sync with size selection (the product
  // detail page), it owns this state and passes it down. Falls back to
  // fully self-managed state for any other/future caller.
  sizeIdx?: number;
  onSizeChange?: (i: number) => void;
}) {
  const [internalSizeIdx, setInternalSizeIdx] = useState(0);
  const sizeIdx = controlledSizeIdx ?? internalSizeIdx;
  const setSizeIdx = onSizeChange ?? setInternalSizeIdx;
  const [qty, setQty] = useState(1);
  const [wished, setWished] = useState(initialWishlisted);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const router = useRouter();
  const size = variants[sizeIdx];
  const discount = size ? calculateDiscountPercent(size.price, size.mrp) : null;
  const stockStatus = size ? getStockStatus(size.quantity, size.lowStockThreshold) : "OUT_OF_STOCK";

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: productName, url });
      } catch {
        // Cancelled by the user — not an error worth surfacing.
      }
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    }
  }

  function handleAddToCart() {
    if (!size) return;
    addItem({ variantId: size.id, productId, name: productName, size: size.size, price: size.price, mrp: size.mrp, image: productImage }, qty);
    showToast(`${productName} added to cart`);
  }

  function handleBuyNow() {
    if (!size) return;
    addItem({ variantId: size.id, productId, name: productName, size: size.size, price: size.price, mrp: size.mrp, image: productImage }, qty);
    router.push("/checkout");
  }

  async function handleToggleWishlist() {
    const next = !wished;
    setWished(next); // optimistic — reverted below if the call fails
    const result = next ? await addToWishlist({ productId, variantId: size?.id }) : await removeFromWishlist(productId);
    if (!result.success) {
      setWished(!next);
      showToast(result.error.message.includes("signed in") ? "Log in to save items to your wishlist" : result.error.message);
    }
  }

  return (
    <div>
      {(categoryName || fragranceNotes) && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {categoryName && <span className="muv-badge-pill" style={{ color: "var(--lavender)", borderColor: "rgba(183,171,240,0.4)" }}>{categoryName}</span>}
          {/* Phase 18 — previously one pill holding the whole raw
              comma-separated string ("Oud, Amber, Musk"); each real note now
              gets its own pill, same real field, more legible at a glance. */}
          {fragranceNotes && fragranceNotes.split(",").map((note) => note.trim()).filter(Boolean).map((note) => (
            <span key={note} className="muv-badge-pill" style={{ color: "rgba(var(--text-rgb),0.7)", borderColor: "var(--card-border)" }}>{note}</span>
          ))}
        </div>
      )}

      {rating != null && (
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={13} fill={i < Math.round(rating) ? "var(--lavender)" : "none"} color="var(--lavender)" strokeWidth={1.2} />
            ))}
          </div>
          <span className="muv-text-meta text-sm">{rating.toFixed(1)} · {reviewCount} reviews</span>
        </div>
      )}

      {size && (
        <div className="flex items-baseline gap-3 mb-2">
          <span className="font-display muv-text-solid" style={{ fontWeight: 500, fontSize: 30 }}>₹{size.price}</span>
          {discount != null && (
            <>
              <span className="muv-text-faint text-sm line-through">₹{size.mrp}</span>
              <span style={{ color: "var(--lavender)" }} className="text-xs font-medium">{discount}% OFF</span>
            </>
          )}
        </div>
      )}

      {size && (
        <span
          className="muv-badge-pill inline-block mb-6"
          style={{
            color: stockStatus === "OUT_OF_STOCK" ? "rgba(var(--text-rgb),0.5)" : stockStatus === "LOW_STOCK" ? "var(--lavender)" : "#34D399",
            borderColor: stockStatus === "OUT_OF_STOCK" ? "var(--card-border)" : stockStatus === "LOW_STOCK" ? "rgba(183,171,240,0.4)" : "rgba(52,211,153,0.35)",
          }}
        >
          {STOCK_STATUS_LABEL[stockStatus]}
        </span>
      )}

      <p className="muv-text-body text-xs uppercase tracking-wide mb-2">Size</p>
      <div className="flex gap-2 mb-6 flex-wrap">
        {variants.map((v, i) => (
          <button
            key={v.id}
            onClick={() => setSizeIdx(i)}
            className="px-4 py-2 rounded-xl text-sm border muv-chip"
            style={{
              borderColor: sizeIdx === i ? "var(--lavender)" : "var(--card-border)",
              background: sizeIdx === i ? "rgba(183,171,240,0.12)" : "transparent",
              color: "rgba(var(--text-rgb),0.9)",
            }}
          >
            {v.size}
          </button>
        ))}
      </div>

      <p className="muv-text-body text-xs uppercase tracking-wide mb-2">Quantity</p>
      <div className="flex items-center border rounded-full px-1 py-1 w-fit mb-8" style={{ borderColor: "var(--card-border)" }}>
        <button onClick={() => setQty(Math.max(1, qty - 1))} className="muv-text-solid muv-tap-target" aria-label="Decrease quantity">−</button>
        <span className="muv-text-solid px-2">{qty}</span>
        <button onClick={() => setQty(qty + 1)} className="muv-text-solid muv-tap-target" aria-label="Increase quantity">+</button>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-8">
        <Button variant="ghost" onClick={handleAddToCart} disabled={stockStatus === "OUT_OF_STOCK"}>
          <ShoppingBag size={16} /> Add to Cart
        </Button>
        <Button variant="primary" onClick={handleBuyNow} disabled={stockStatus === "OUT_OF_STOCK"}>
          Buy Now <ArrowRight size={15} />
        </Button>
        <button className="muv-icon-circle" onClick={handleToggleWishlist} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}>
          <Heart size={17} fill={wished ? "var(--lavender)" : "none"} color={wished ? "var(--lavender)" : "#fff"} />
        </button>
        <button className="muv-icon-circle" onClick={handleShare} aria-label="Share this product">
          <Share2 size={16} />
        </button>
      </div>

      {size && (
        <div className="grid grid-cols-3 gap-3 muv-card" style={{ padding: 14 }}>
          <div><p className="muv-text-faint text-[10px] uppercase">SKU</p><p className="muv-text-body text-xs mt-0.5">{size.sku}</p></div>
          <div><p className="muv-text-faint text-[10px] uppercase">HSN</p><p className="muv-text-body text-xs mt-0.5">{hsnCode}</p></div>
          <div><p className="muv-text-faint text-[10px] uppercase">GST</p><p className="muv-text-body text-xs mt-0.5">{gstRate}%</p></div>
        </div>
      )}
    </div>
  );
}
