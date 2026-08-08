"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { ProductImage } from "@/components/storefront/product-image";
import { IMAGE_PRESETS } from "@/lib/utils/cloudinary-image";
import { recordProductView } from "@/actions/recently-viewed";

type ViewedProduct = { slug: string; name: string; image?: string; price: number; categoryName: string; productId?: string };

const STORAGE_KEY = "muv-recently-viewed";
const MAX_ITEMS = 8;

/**
 * Real, working, self-contained — no backend model, no new API. Reads/writes
 * a small localStorage list of product snapshots captured at view time
 * (this is genuinely "architecture only, CMS-ready" per the brief: the
 * display shell is real today, and swapping localStorage for a server-backed
 * per-customer history later wouldn't change this component's rendering,
 * only where `viewed` comes from). Snapshots are the actual price/name/
 * image seen at the time of viewing — never refreshed or fabricated, so a
 * card here can go stale if a price changes, same tradeoff every
 * localStorage-based "recently viewed" implementation makes.
 *
 * Phase 14A: when `current.productId` is passed and the viewer is logged
 * in, this also fires a real, fire-and-forget `recordProductView` so the
 * same history persists server-side for that customer (cross-device, and
 * the source the recommendation engine and personalized homepage read from)
 * — the on-page widget itself still renders from localStorage, unchanged,
 * for instant, no-flicker display.
 */
export function RecentlyViewed({ current }: { current: ViewedProduct }) {
  const [viewed, setViewed] = useState<ViewedProduct[]>([]);

  useEffect(() => {
    let list: ViewedProduct[] = [];
    try {
      list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      list = [];
    }

    const others = list.filter((p) => p.slug !== current.slug);
    setViewed(others);

    const updated = [current, ...others].slice(0, MAX_ITEMS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Storage unavailable (private browsing, quota) — not worth surfacing.
    }

    if (current.productId) {
      recordProductView(current.productId).catch(() => {});
    }
    // Only re-run when the viewed product itself changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.slug]);

  if (viewed.length === 0) return null;

  return (
    <section className="mt-20">
      <Reveal>
        <p className="muv-eyebrow mb-3">Recently Viewed</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Where you left off</h2>
      </Reveal>
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory muv-scroll-row pb-2" tabIndex={0} role="region" aria-label="Recently viewed products">
        {viewed.map((p) => (
          <Link key={p.slug} href={`/products/${p.slug}`} className="muv-card flex-shrink-0 snap-start" style={{ width: 160, padding: 12 }}>
            <div className="muv-product-visual" style={{ height: 120 }}>
              <ProductImage src={p.image} alt={p.name} transform={IMAGE_PRESETS.thumbnail} sizes="160px" rounded={10} />
            </div>
            <p className="muv-text-meta text-[10px] uppercase tracking-widest mt-3">{p.categoryName}</p>
            <p className="muv-text-solid text-xs mt-0.5" style={{ fontWeight: 500, lineHeight: 1.3 }}>{p.name}</p>
            <p className="muv-text-solid text-xs mt-1.5">₹{p.price}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
