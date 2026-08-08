"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Heart } from "lucide-react";
import { removeFromWishlist } from "@/actions/wishlist";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";
import { ProductImage } from "@/components/storefront/product-image";
import { IMAGE_PRESETS } from "@/lib/utils/cloudinary-image";

type WishlistItem = { id: string; productId: string; name: string; slug: string; image?: string; price: number | null };

export function WishlistClient({ items }: { items: WishlistItem[] }) {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function handleRemove(productId: string) {
    startTransition(async () => {
      const result = await removeFromWishlist(productId);
      if (result.success) {
        showToast("Removed from wishlist");
        router.refresh();
      } else {
        showToast(result.error.message);
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="muv-icon-circle mb-5" style={{ width: 56, height: 56, margin: "0 auto" }} aria-hidden>
          <Heart size={22} />
        </div>
        <p className="muv-text-solid text-sm font-medium mb-1.5">Your wishlist is empty</p>
        <p className="muv-text-meta text-sm mb-6">Save anything you're eyeing — it'll wait for you here.</p>
        <Link href="/shop"><Button variant="ghost">Explore Products</Button></Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {items.map((item) => (
        <div key={item.id} className="muv-card">
          <div className="flex items-start justify-between gap-3">
            <Link href={`/products/${item.slug}`} className="flex items-start gap-3 min-w-0">
              <div className="muv-product-visual" style={{ width: 56, height: 56, flexShrink: 0 }}>
                <ProductImage src={item.image} alt={item.name} transform={IMAGE_PRESETS.micro} sizes="56px" rounded={10} />
              </div>
              <div className="min-w-0">
                <p className="font-display muv-text-solid text-sm truncate" style={{ fontWeight: 500 }}>{item.name}</p>
                {item.price != null && <p className="muv-text-body text-sm mt-1">₹{item.price}</p>}
              </div>
            </Link>
            <button onClick={() => handleRemove(item.productId)} disabled={isPending} className="muv-text-meta" aria-label={`Remove ${item.name} from wishlist`}>
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
