"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { calculateDiscountPercent } from "@/lib/utils/discount";
import { getStockStatus, STOCK_STATUS_LABEL } from "@/lib/utils/stock-status";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/components/ui/toast";
import { ProductImage } from "@/components/storefront/product-image";
import { IMAGE_PRESETS } from "@/lib/utils/cloudinary-image";

type QuickViewProduct = {
  id: string; name: string; slug: string; category: { name: string };
  images?: string[]; rating: number | null; reviewCount: number;
  variants: { id: string; size: string; price: number; mrp: number; quantity: number; lowStockThreshold: number }[];
};

export function QuickViewModal({ product, onClose }: { product: QuickViewProduct; onClose: () => void }) {
  const variant = product.variants[0];
  const discount = variant ? calculateDiscountPercent(variant.price, variant.mrp) : null;
  const stockStatus = variant ? getStockStatus(variant.quantity, variant.lowStockThreshold) : "OUT_OF_STOCK";
  const { addItem } = useCart();
  const { showToast } = useToast();

  function handleAdd() {
    if (!variant) return;
    addItem({ variantId: variant.id, productId: product.id, name: product.name, size: variant.size, price: variant.price, mrp: variant.mrp, image: product.images?.[0] });
    showToast(`${product.name} added to cart`);
  }

  return (
    <Modal title="Quick View" onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="muv-product-visual" style={{ height: 280, borderRadius: 16 }}>
          <ProductImage src={product.images?.[0]} alt={product.name} transform={IMAGE_PRESETS.thumbnail} sizes="(max-width: 640px) 90vw, 340px" rounded={16} />
        </div>
        <div>
          <p className="muv-text-meta text-[11px] uppercase tracking-widest mb-2">{product.category.name}</p>
          <h2 className="font-display muv-text-solid text-xl mb-2" style={{ fontWeight: 500 }}>{product.name}</h2>
          {product.rating != null && (
            <div className="flex items-center gap-1 mb-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12} fill={i < Math.round(product.rating!) ? "var(--lavender)" : "none"} color="var(--lavender)" strokeWidth={1.2} />
              ))}
              <span className="muv-text-faint text-xs ml-1">({product.reviewCount})</span>
            </div>
          )}
          {variant && (
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-display muv-text-solid" style={{ fontSize: 24, fontWeight: 500 }}>₹{variant.price}</span>
              {discount != null && (
                <>
                  <span className="muv-text-faint text-sm line-through">₹{variant.mrp}</span>
                  <span className="text-xs" style={{ color: "var(--lavender)" }}>{discount}% OFF</span>
                </>
              )}
            </div>
          )}
          <p className="text-xs mb-5" style={{ color: stockStatus === "OUT_OF_STOCK" ? "rgba(var(--text-rgb),0.4)" : "var(--lavender)" }}>
            {STOCK_STATUS_LABEL[stockStatus]}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" onClick={handleAdd} disabled={stockStatus === "OUT_OF_STOCK"}>Add to Cart</Button>
            <Link href={`/products/${product.slug}`}><Button variant="primary">View Full Details</Button></Link>
          </div>
        </div>
      </div>
    </Modal>
  );
}