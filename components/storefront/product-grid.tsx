"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Star, Heart, Eye } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/components/ui/toast";
import { PRODUCT_SIZES } from "@/lib/constants/sizes";
import { calculateDiscountPercent } from "@/lib/utils/discount";
import { getStockStatus, STOCK_STATUS_LABEL } from "@/lib/utils/stock-status";
import { fuzzyMatch } from "@/lib/utils/fuzzy-search";
import { addToWishlist, removeFromWishlist } from "@/actions/wishlist";
import { logSearch } from "@/actions/search";
import { QuickViewModal } from "@/components/storefront/quick-view-modal";
import { ProductImage } from "@/components/storefront/product-image";
import { IMAGE_PRESETS } from "@/lib/utils/cloudinary-image";

type Product = {
  id: string;
  name: string;
  slug: string;
  brand?: string | null;
  category: { name: string; slug: string };
  shortDescription?: string | null;
  fragranceNotes?: string | null;
  searchKeywords?: string[];
  createdAt?: string | Date;
  bestSellerRank?: number | null;
  images?: string[];
  variants: { id: string; size: string; sku?: string; price: number; mrp: number; quantity: number; lowStockThreshold: number; inStock: boolean }[];
  rating: number | null;
  reviewCount: number;
};

const RECENT_SEARCHES_KEY = "muv-recent-searches";
const MAX_RECENT_SEARCHES = 6;

/** Real, self-contained typo tolerance (lib/utils/fuzzy-search.ts) across
 * every field a shopper would plausibly search by — name, brand, category,
 * fragrance, Founder-approved search keywords (Production Customer Content
 * Layer), and SKU — not just an exact name substring like before. */
function matchesSearch(p: Product, query: string): boolean {
  if (!query.trim()) return true;
  if (fuzzyMatch(p.name, query)) return true;
  if (p.brand && fuzzyMatch(p.brand, query)) return true;
  if (fuzzyMatch(p.category.name, query)) return true;
  if (p.fragranceNotes && fuzzyMatch(p.fragranceNotes, query)) return true;
  if (p.searchKeywords?.some((k) => fuzzyMatch(k, query))) return true;
  return p.variants.some((v) => v.sku && v.sku.toLowerCase().includes(query.trim().toLowerCase()));
}

const SORTS = [
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "bestselling", label: "Best Selling" },
  { id: "price-asc", label: "Price: Low to High" },
  { id: "price-desc", label: "Price: High to Low" },
  { id: "name", label: "Name: A–Z" },
];

// Real, dynamically-derived price buckets — not a hardcoded taxonomy. Widens
// or narrows automatically as real variant prices change, so this never
// drifts out of sync with what's actually in the catalog.
function buildPriceBuckets(products: Product[]) {
  const prices = products.flatMap((p) => p.variants.map((v) => v.price)).filter((p) => p > 0);
  if (prices.length === 0) return [];
  const max = Math.max(...prices);
  if (max <= 500) return [{ id: "under-500", label: "Under ₹500", max: 500 }];
  const step = max <= 1500 ? 500 : 1000;
  const buckets: { id: string; label: string; min?: number; max?: number }[] = [];
  for (let start = 0; start < max; start += step) {
    const end = start + step;
    buckets.push({ id: `${start}-${end}`, label: end >= max ? `₹${start}+` : `₹${start}–₹${end}`, min: start || undefined, max: end < max ? end : undefined });
  }
  return buckets;
}

// fragranceNotes is real free-text ("Oud, Amber, Musk"), not a controlled
// taxonomy — tokenized and deduped across the catalog so the filter grows
// naturally as more products are added, rather than one chip per product.
function extractFragranceTokens(products: Product[]) {
  const tokens = new Set<string>();
  for (const p of products) {
    if (!p.fragranceNotes) continue;
    p.fragranceNotes.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => tokens.add(t));
  }
  return Array.from(tokens).sort();
}

// Real discount thresholds — a product only has a real discount when its
// cheapest variant's MRP exceeds its price, same calculateDiscountPercent
// every price tag on this grid already uses. Only offers thresholds the
// catalog can actually satisfy, same "no chip with nothing behind it" rule
// as size/category/fragrance above.
const DISCOUNT_THRESHOLDS = [10, 20, 30, 40] as const;
function maxDiscount(p: Product): number {
  return Math.max(0, ...p.variants.map((v) => calculateDiscountPercent(v.price, v.mrp) ?? 0));
}
function buildDiscountBuckets(products: Product[]) {
  return DISCOUNT_THRESHOLDS.filter((t) => products.some((p) => maxDiscount(p) >= t));
}

export function ProductGrid({ products, wishlistedIds = [], initialSearch = "", popularSearches = [] }: { products: Product[]; wishlistedIds?: string[]; initialSearch?: string; popularSearches?: { term: string; count: number }[] }) {
  const [search, setSearch] = useState(initialSearch);
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("featured");
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activePriceBucket, setActivePriceBucket] = useState<string | null>(null);
  const [activeFragrance, setActiveFragrance] = useState<string | null>(null);
  const [activeRating, setActiveRating] = useState<number | null>(null);
  const [activeDiscount, setActiveDiscount] = useState<number | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set(wishlistedIds));
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const searchLogTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    try {
      setRecentSearches(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]"));
    } catch {
      setRecentSearches([]);
    }
  }, []);

  function commitSearch(term: string, resultCount: number) {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable — not worth surfacing.
      }
      return next;
    });
    logSearch({ term: trimmed, resultCount }).catch(() => {});
  }

  // Only offer sizes/categories/fragrances that at least one product in this
  // list actually has — no point showing a chip with nothing behind it.
  const availableSizes = useMemo(() => {
    const present = new Set(products.flatMap((p) => p.variants.map((v) => v.size)));
    return PRODUCT_SIZES.filter((s) => present.has(s));
  }, [products]);

  // Category filter only makes sense where the list actually spans more
  // than one category (/shop) — on a single-category collection page every
  // product already shares one category, so this naturally stays hidden
  // there without needing a prop to say so.
  const availableCategories = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.category.slug, p.category.name));
    return Array.from(map.entries()).map(([slug, name]) => ({ slug, name }));
  }, [products]);

  const priceBuckets = useMemo(() => buildPriceBuckets(products), [products]);
  const fragranceTokens = useMemo(() => extractFragranceTokens(products), [products]);
  const discountBuckets = useMemo(() => buildDiscountBuckets(products), [products]);

  const filtered = useMemo(() => {
    let list = products.filter((p) => matchesSearch(p, search));
    if (activeSize) list = list.filter((p) => p.variants.some((v) => v.size === activeSize));
    if (activeCategory) list = list.filter((p) => p.category.slug === activeCategory);
    if (activeFragrance) list = list.filter((p) => p.fragranceNotes?.toLowerCase().includes(activeFragrance.toLowerCase()));
    if (inStockOnly) list = list.filter((p) => p.variants.some((v) => v.inStock));
    if (activeRating) list = list.filter((p) => (p.rating ?? 0) >= activeRating);
    if (activeDiscount) list = list.filter((p) => maxDiscount(p) >= activeDiscount);
    if (activePriceBucket) {
      const bucket = priceBuckets.find((b) => b.id === activePriceBucket);
      if (bucket) {
        list = list.filter((p) =>
          p.variants.some((v) => (bucket.min === undefined || v.price >= bucket.min) && (bucket.max === undefined || v.price < bucket.max))
        );
      }
    }
    if (sortBy === "price-asc") list = [...list].sort((a, b) => (a.variants[0]?.price ?? 0) - (b.variants[0]?.price ?? 0));
    if (sortBy === "price-desc") list = [...list].sort((a, b) => (b.variants[0]?.price ?? 0) - (a.variants[0]?.price ?? 0));
    if (sortBy === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "newest") list = [...list].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    if (sortBy === "bestselling") {
      // Nulls last — most products don't have a bestSellerRank set yet
      // (admin-assigned, per app/(storefront)/page.tsx's note), so this sort
      // is architecturally real today and simply gets more useful as ranks
      // are assigned, never fabricated in the meantime.
      list = [...list].sort((a, b) => (a.bestSellerRank ?? Infinity) - (b.bestSellerRank ?? Infinity));
    }
    return list;
  }, [products, search, sortBy, activeSize, activeCategory, activeFragrance, activePriceBucket, activeRating, activeDiscount, inStockOnly, priceBuckets]);

  // Debounced — logs the committed search term (for Recent/Popular Searches)
  // 700ms after the shopper stops typing, not on every keystroke.
  useEffect(() => {
    clearTimeout(searchLogTimer.current);
    if (!search.trim()) return;
    searchLogTimer.current = setTimeout(() => commitSearch(search, filtered.length), 700);
    return () => clearTimeout(searchLogTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Top name matches shown as a live suggestions dropdown while typing —
  // real product data already loaded client-side, not a separate endpoint.
  const suggestions = useMemo(() => {
    if (!search.trim() || search.trim().length < 2) return [];
    return products.filter((p) => fuzzyMatch(p.name, search)).slice(0, 6);
  }, [products, search]);

  const filterCount = [activeSize, activeCategory, activeFragrance, activePriceBucket, activeRating, activeDiscount, inStockOnly || null].filter(Boolean).length;
  const hasActiveFilters = filterCount > 0;

  function clearFilters() {
    setActiveSize(null);
    setActiveCategory(null);
    setActiveFragrance(null);
    setActivePriceBucket(null);
    setActiveRating(null);
    setActiveDiscount(null);
    setInStockOnly(false);
  }

  // A filtered-out size's variant may not be index 0 anymore — resolve the
  // matching (or first) variant per product for price/add-to-cart, rather
  // than always assuming variants[0] once a size filter is active.
  function displayVariant(p: Product) {
    if (activeSize) return p.variants.find((v) => v.size === activeSize) ?? p.variants[0];
    return p.variants[0];
  }

  function handleAdd(p: Product) {
    const variant = displayVariant(p);
    if (!variant) return;
    addItem({ variantId: variant.id, productId: p.id, name: p.name, size: variant.size, price: variant.price, mrp: variant.mrp, image: p.images?.[0] });
    showToast(`${p.name} added to cart`);
  }

  async function handleToggleWishlist(p: Product) {
    const isWishlisted = wishlist.has(p.id);
    // optimistic — reverted if the call fails
    setWishlist((prev) => {
      const next = new Set(prev);
      isWishlisted ? next.delete(p.id) : next.add(p.id);
      return next;
    });
    const result = isWishlisted ? await removeFromWishlist(p.id) : await addToWishlist({ productId: p.id });
    if (!result.success) {
      setWishlist((prev) => {
        const next = new Set(prev);
        isWishlisted ? next.add(p.id) : next.delete(p.id);
        return next;
      });
      showToast(result.error.message.includes("signed in") ? "Log in to save items to your wishlist" : result.error.message);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 240 }}>
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 muv-text-faint" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            placeholder="Search products, brand, fragrance, SKU…"
            aria-label="Search products"
            className="muv-input"
            style={{ paddingLeft: 40 }}
          />

          {searchFocused && (search.trim().length >= 2 ? suggestions.length > 0 : recentSearches.length > 0 || popularSearches.length > 0) && (
            <div className="muv-card absolute left-0 right-0 mt-2 z-20" style={{ padding: 8, maxHeight: 320, overflowY: "auto" }}>
              {search.trim().length >= 2 ? (
                suggestions.map((p) => (
                  <Link
                    key={p.id}
                    href={`/products/${p.slug}`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-sm muv-text-body hover:text-white"
                    style={{ transition: "background 0.3s var(--ease), color 0.3s var(--ease)" }}
                  >
                    <span>{p.name}</span>
                    <span className="muv-text-faint text-xs">{p.category.name}</span>
                  </Link>
                ))
              ) : (
                <>
                  {recentSearches.length > 0 && (
                    <div className="mb-1">
                      <p className="muv-text-faint text-[10px] uppercase tracking-widest px-3 py-1.5">Recent Searches</p>
                      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                        {recentSearches.map((term) => (
                          <button key={term} onClick={() => setSearch(term)} className="px-2.5 py-1 rounded-full text-xs border" style={{ borderColor: "var(--card-border)", color: "rgba(var(--text-rgb),0.7)" }}>
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {popularSearches.length > 0 && (
                    <div>
                      <p className="muv-text-faint text-[10px] uppercase tracking-widest px-3 py-1.5">Popular Searches</p>
                      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                        {popularSearches.map((p) => (
                          <button key={p.term} onClick={() => setSearch(p.term)} className="px-2.5 py-1 rounded-full text-xs border" style={{ borderColor: "var(--card-border)", color: "rgba(var(--text-rgb),0.7)" }}>
                            {p.term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="muv-input" style={{ width: "auto" }} aria-label="Sort products">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {availableCategories.length > 1 && (
        <div role="group" aria-label="Filter by category" className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            aria-pressed={!activeCategory}
            className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
            style={{ borderColor: !activeCategory ? "var(--lavender)" : "var(--card-border)", background: !activeCategory ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
          >
            All Categories
          </button>
          {availableCategories.map((c) => (
            <button
              key={c.slug}
              onClick={() => setActiveCategory(c.slug)}
              aria-pressed={activeCategory === c.slug}
              className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
              style={{ borderColor: activeCategory === c.slug ? "var(--lavender)" : "var(--card-border)", background: activeCategory === c.slug ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {availableSizes.length > 0 && (
        <div role="group" aria-label="Filter by size" className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setActiveSize(null)}
            aria-pressed={!activeSize}
            className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
            style={{ borderColor: !activeSize ? "var(--lavender)" : "var(--card-border)", background: !activeSize ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
          >
            All Sizes
          </button>
          {availableSizes.map((size) => (
            <button
              key={size}
              onClick={() => setActiveSize(size)}
              aria-pressed={activeSize === size}
              className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
              style={{ borderColor: activeSize === size ? "var(--lavender)" : "var(--card-border)", background: activeSize === size ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
            >
              {size}
            </button>
          ))}
        </div>
      )}

      {priceBuckets.length > 1 && (
        <div role="group" aria-label="Filter by price" className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setActivePriceBucket(null)}
            aria-pressed={!activePriceBucket}
            className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
            style={{ borderColor: !activePriceBucket ? "var(--lavender)" : "var(--card-border)", background: !activePriceBucket ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
          >
            Any Price
          </button>
          {priceBuckets.map((b) => (
            <button
              key={b.id}
              onClick={() => setActivePriceBucket(b.id)}
              aria-pressed={activePriceBucket === b.id}
              className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
              style={{ borderColor: activePriceBucket === b.id ? "var(--lavender)" : "var(--card-border)", background: activePriceBucket === b.id ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {fragranceTokens.length > 0 && (
        <div role="group" aria-label="Filter by fragrance" className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setActiveFragrance(null)}
            aria-pressed={!activeFragrance}
            className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
            style={{ borderColor: !activeFragrance ? "var(--lavender)" : "var(--card-border)", background: !activeFragrance ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
          >
            Any Fragrance
          </button>
          {fragranceTokens.map((t) => (
            <button
              key={t}
              onClick={() => setActiveFragrance(t)}
              aria-pressed={activeFragrance === t}
              className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
              style={{ borderColor: activeFragrance === t ? "var(--lavender)" : "var(--card-border)", background: activeFragrance === t ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {discountBuckets.length > 0 && (
        <div role="group" aria-label="Filter by discount" className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setActiveDiscount(null)}
            aria-pressed={!activeDiscount}
            className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
            style={{ borderColor: !activeDiscount ? "var(--lavender)" : "var(--card-border)", background: !activeDiscount ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
          >
            Any Discount
          </button>
          {discountBuckets.map((t) => (
            <button
              key={t}
              onClick={() => setActiveDiscount(t)}
              aria-pressed={activeDiscount === t}
              className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
              style={{ borderColor: activeDiscount === t ? "var(--lavender)" : "var(--card-border)", background: activeDiscount === t ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
            >
              {t}% off+
            </button>
          ))}
        </div>
      )}

      <div role="group" aria-label="Filter by rating" className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setActiveRating(null)}
          aria-pressed={!activeRating}
          className="px-3.5 py-1.5 rounded-full text-xs border muv-chip"
          style={{ borderColor: !activeRating ? "var(--lavender)" : "var(--card-border)", background: !activeRating ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
        >
          Any Rating
        </button>
        {[4, 3].map((r) => (
          <button
            key={r}
            onClick={() => setActiveRating(r)}
            aria-pressed={activeRating === r}
            className="px-3.5 py-1.5 rounded-full text-xs border muv-chip inline-flex items-center gap-1"
            style={{ borderColor: activeRating === r ? "var(--lavender)" : "var(--card-border)", background: activeRating === r ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}
          >
            {r}<Star size={11} fill="currentColor" /> & up
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs muv-text-meta cursor-pointer">
          <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} style={{ accentColor: "var(--lavender)" }} />
          In stock only
        </label>
        {(hasActiveFilters || search) && (
          <button
            onClick={() => {
              clearFilters();
              setSearch("");
            }}
            className="muv-footer-link muv-text-meta hover:text-white text-xs uppercase tracking-widest inline-flex items-center gap-1.5"
          >
            Clear all{filterCount > 0 && <span className="muv-badge-pill" style={{ padding: "1px 7px" }}>{filterCount}</span>}
          </button>
        )}
      </div>

      {products.length === 0 ? (
        <div className="muv-card text-center py-20">
          <p className="muv-text-solid text-sm font-medium mb-2">Nothing here yet</p>
          <p className="muv-text-meta text-sm">New products are on their way — check back soon.</p>
        </div>
      ) : filtered.length === 0 && search ? (
        <div className="muv-card text-center py-20">
          <p className="muv-text-solid text-sm font-medium mb-2">No results for &ldquo;{search}&rdquo;</p>
          <p className="muv-text-meta text-sm mb-5">Try a different search, or clear it to see everything.</p>
          <button onClick={() => setSearch("")} className="muv-footer-link muv-text-meta hover:text-white text-xs uppercase tracking-widest">
            Clear search
          </button>
          {/* Phase 18 — previously this state offered no next step beyond
              clearing the search; popularSearches was already fetched and
              used elsewhere on this page (the pre-search dropdown) but never
              reused here, the one place a shopper most needs a suggestion. */}
          {popularSearches.length > 0 && (
            <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--hairline)" }}>
              <p className="muv-text-faint text-[11px] uppercase tracking-widest mb-3">Popular Searches</p>
              <div className="flex flex-wrap justify-center gap-2">
                {popularSearches.map((p) => (
                  <button key={p.term} onClick={() => setSearch(p.term)} className="muv-chip px-3 py-1.5 rounded-full text-xs border" style={{ borderColor: "var(--card-border)", color: "rgba(var(--text-rgb),0.8)" }}>
                    {p.term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="muv-card text-center py-20">
          <p className="muv-text-solid text-sm font-medium mb-2">No products match your filters</p>
          <p className="muv-text-meta text-sm mb-5">Try loosening a filter, or clear them all.</p>
          <button onClick={clearFilters} className="muv-footer-link muv-text-meta hover:text-white text-xs uppercase tracking-widest">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filtered.map((p) => {
            const variant = displayVariant(p);
            const discount = variant ? calculateDiscountPercent(variant.price, variant.mrp) : null;
            const stockStatus = variant ? getStockStatus(variant.quantity, variant.lowStockThreshold) : "OUT_OF_STOCK";
            const isWishlisted = wishlist.has(p.id);

            return (
              <div key={p.id} className="muv-card muv-card-hover relative">
                <button
                  onClick={() => handleToggleWishlist(p)}
                  className="muv-icon-circle absolute top-3 right-3 z-10"
                  style={{ width: 32, height: 32, background: "rgba(11,11,15,0.5)" }}
                  aria-label={isWishlisted ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
                >
                  <Heart size={14} fill={isWishlisted ? "var(--lavender)" : "none"} color={isWishlisted ? "var(--lavender)" : "#fff"} />
                </button>
                <button
                  onClick={() => setQuickViewProduct(p)}
                  className="muv-icon-circle absolute top-3 z-10"
                  style={{ width: 32, height: 32, background: "rgba(11,11,15,0.5)", right: 47 }}
                  aria-label={`Quick view ${p.name}`}
                >
                  <Eye size={14} color="#fff" />
                </button>

                <Link href={`/products/${p.slug}`}>
                  <div className="muv-product-visual" style={{ height: 190 }}>
                    <ProductImage
                      src={p.images?.[0]}
                      alt={p.name}
                      transform={IMAGE_PRESETS.thumbnail}
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      rounded={14}
                    />
                  </div>
                  <p className="muv-text-meta text-[11px] uppercase tracking-widest mt-5">{p.category.name}</p>
                  <h3 className="font-display muv-text-solid text-lg mt-1" style={{ fontWeight: 500 }}>{p.name}</h3>
                  {p.shortDescription && (
                    <p className="muv-text-meta text-xs mt-1" style={{ lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {p.shortDescription}
                    </p>
                  )}
                </Link>

                {p.rating != null && (
                  <div className="flex items-center gap-1 mt-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={11} fill={i < Math.round(p.rating!) ? "var(--lavender)" : "none"} color="var(--lavender)" strokeWidth={1.2} />
                    ))}
                    <span className="muv-text-faint text-[11px] ml-1">({p.reviewCount})</span>
                  </div>
                )}

                {variant && <p className="muv-text-meta text-xs mt-2">{variant.size}</p>}

                {variant && (
                  <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                    <span className="muv-text-solid text-sm">₹{variant.price}</span>
                    {discount != null && (
                      <>
                        <span className="muv-text-faint text-xs line-through">₹{variant.mrp}</span>
                        <span className="text-xs" style={{ color: "var(--lavender)" }}>{discount}% OFF</span>
                      </>
                    )}
                  </div>
                )}

                <p className="text-[11px] mt-1.5" style={{ color: stockStatus === "OUT_OF_STOCK" ? "rgba(var(--text-rgb),0.35)" : stockStatus === "LOW_STOCK" ? "var(--lavender)" : "rgba(var(--text-rgb),0.5)" }}>
                  {STOCK_STATUS_LABEL[stockStatus]}
                </p>

                <div className="flex items-center justify-end mt-3">
                  <button
                    className="muv-footer-link text-xs uppercase tracking-widest"
                    style={{ color: "var(--lavender)", opacity: stockStatus === "OUT_OF_STOCK" ? 0.4 : 1 }}
                    onClick={() => handleAdd(p)}
                    disabled={stockStatus === "OUT_OF_STOCK"}
                  >
                    {stockStatus === "OUT_OF_STOCK" ? "Unavailable" : "Add to Cart"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {quickViewProduct && <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />}
    </div>
  );
}
