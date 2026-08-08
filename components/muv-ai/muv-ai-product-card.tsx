"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { ProductImage } from "@/components/storefront/product-image";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/components/ui/toast";
import { getMuvAiProductCard, type MuvAiProductCard as ProductCardData } from "@/actions/muv-ai-beta";

/**
 * Rich product card for an assistant turn's REFERENCE_CARD segment.
 * Every field shown is fetched fresh from the real storefront `Product`
 * (via `getMuvAiProductCard`, resolved from Module 6/7's own
 * `ProductIntelligence` reference) — nothing here is written by the AI or
 * invented client-side. "Add to Cart" reuses the site's own existing cart
 * context unchanged; this component makes no purchasing decision itself.
 */
export function MuvAiProductCard({ referenceType, referenceId, label }: { referenceType: string; referenceId: string; label: string }) {
  const [card, setCard] = useState<ProductCardData | null | "loading">("loading");
  const { addItem } = useCart();
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    void getMuvAiProductCard(referenceType, referenceId).then((result) => {
      if (cancelled) return;
      setCard(result.success ? result.data.card : null);
    });
    return () => {
      cancelled = true;
    };
  }, [referenceType, referenceId]);

  if (card === "loading") {
    return <div className="muv-ai-product-card muv-ai-product-card-loading" aria-label="Loading product">{label}</div>;
  }

  // The reference didn't resolve to a live, published product — fall back
  // to the plain reference chip rather than showing a broken card.
  if (!card) {
    return (
      <div className="muv-ai-reference-card">
        <span className="muv-ai-reference-card-dot" aria-hidden />
        {label}
      </div>
    );
  }

  function handleAddToCart() {
    if (!card || card === "loading" || !card.variantId || card.price === null) return;
    addItem({ variantId: card.variantId, productId: card.id, name: card.name, size: "", price: card.price, mrp: card.mrp ?? card.price, image: card.image ?? undefined });
    showToast(`${card.name} added to cart`);
  }

  return (
    <div className="muv-ai-product-card">
      <div className="muv-ai-product-card-image">
        <ProductImage src={card.image} alt={card.name} rounded={14} sizes="64px" />
      </div>
      <div className="muv-ai-product-card-body">
        <div className="muv-ai-product-card-name">{card.name}</div>
        {card.shortDescription && <p className="muv-ai-product-card-desc">{card.shortDescription}</p>}
        {card.price !== null && (
          <div className="muv-ai-product-card-price">
            <span className="muv-text-solid">₹{card.price}</span>
            {card.mrp !== null && card.mrp > card.price && <span className="muv-ai-product-card-mrp">₹{card.mrp}</span>}
          </div>
        )}
        <div className="muv-ai-product-card-actions">
          <Link href={`/products/${card.slug}`} className="muv-ai-product-card-view">
            View Product
          </Link>
          {card.variantId && (
            <button type="button" className="muv-ai-product-card-add" onClick={handleAddToCart} aria-label={`Add ${card.name} to cart`}>
              <ShoppingBag size={13} /> Add to Cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
