import Link from "next/link";
import { Sparkles, Droplet, ShieldCheck, Leaf, Car, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildMetadata, buildBreadcrumbSchema } from "@/lib/seo";
import { Reveal } from "@/components/ui/reveal";
import { ProductGrid } from "@/components/storefront/product-grid";
import { FeaturedProducts, type FeaturedProduct } from "@/components/storefront/featured-products";
import { getPopularSearches } from "@/actions/search";
import { extractUSP } from "@/lib/utils/extract-usp";

export const metadata = buildMetadata({ title: "Shop All", description: "Every Muv product, in one place — Home, Fabric, Body, Personal, and Car Care.", path: "/shop" });

// Local to this page, same treatment as app/(storefront)/page.tsx's own
// CATEGORY_ICONS — not shared/exported, so this never touches the homepage.
const CATEGORY_ICONS: Record<string, any> = {
  "home-care": Sparkles, "fabric-care": Droplet, "body-care": ShieldCheck,
  "personal-care": Leaf, "car-care": Car, "skin-care": Droplet,
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;

  const [categories, products, featuredRaw, session, popularSearches] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: {
        category: { select: { name: true, slug: true } },
        variants: { include: { inventory: true }, orderBy: { price: "asc" } },
        reviews: { where: { status: "APPROVED" }, select: { rating: true } },
        content: { select: { shortDescription: true, keyBenefits: true, searchKeywords: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { isFeatured: true, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { category: true, variants: { orderBy: { price: "asc" }, include: { inventory: true } }, reviews: { where: { status: "APPROVED" } }, content: { select: { keyBenefits: true } } },
    }),
    auth(),
    getPopularSearches(),
  ]);

  const shaped = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    category: p.category,
    shortDescription: p.content?.shortDescription ?? null,
    fragranceNotes: p.fragranceNotes,
    searchKeywords: p.content?.searchKeywords ?? [],
    createdAt: p.createdAt,
    bestSellerRank: p.bestSellerRank,
    rating: p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : null,
    reviewCount: p.reviews.length,
    images: p.images,
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, sku: v.sku, price: v.price, mrp: v.mrp, quantity: v.inventory?.quantity ?? 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 10, inStock: (v.inventory?.quantity ?? 0) > 0 })),
  }));

  let wishlistedIds: string[] = [];
  const allProductIds = [...new Set([...products.map((p) => p.id), ...featuredRaw.map((p) => p.id)])];
  if (session?.user && allProductIds.length > 0) {
    const customer = await prisma.customer.findUnique({ where: { userId: session.user.id } });
    if (customer) {
      const items = await prisma.wishlist.findMany({ where: { customerId: customer.id, productId: { in: allProductIds } }, select: { productId: true } });
      wishlistedIds = items.map((i) => i.productId);
    }
  }

  const featuredProducts: FeaturedProduct[] = featuredRaw.map((p, i) => {
    const sortedVariants = [...p.variants].sort((a, b) => {
      const aInStock = (a.inventory?.quantity ?? 0) > 0 ? 0 : 1;
      const bInStock = (b.inventory?.quantity ?? 0) > 0 ? 0 : 1;
      return aInStock !== bInStock ? aInStock - bInStock : a.price - b.price;
    });
    const v = sortedVariants[0];
    const variant = v ? { id: v.id, size: v.size, price: v.price, mrp: v.mrp, quantity: v.inventory?.quantity ?? 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 10 } : null;
    const rating = p.reviews.length ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length : null;
    const badge: FeaturedProduct["badge"] = variant && variant.quantity > 0 && variant.quantity <= variant.lowStockThreshold ? "Limited" : i === 0 ? "New" : null;
    return { id: p.id, name: p.name, slug: p.slug, category: { name: p.category.name }, images: p.images, usp: extractUSP(p.content?.keyBenefits ?? null), badge, rating, reviewCount: p.reviews.length, variant };
  });

  const breadcrumbSchema = buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }]);

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* ---- Hero — inner-page treatment (not full-bleed like the homepage) ---- */}
      <section className="px-6 text-center" style={{ paddingTop: 96, paddingBottom: 56 }}>
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <p className="muv-eyebrow mb-5">Shop Muv</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3.2rem)" }}>
              Every category, held to one standard.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="muv-text-body mt-5 mx-auto" style={{ fontWeight: 300, fontSize: "16px", lineHeight: 1.8, maxWidth: "56ch" }}>
              Home, Fabric, Body, Personal, and Car Care — {products.length} product{products.length === 1 ? "" : "s"} across five categories, all real, all in stock as shown.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---- Category introduction ---- */}
      {categories.length > 0 && (
        <section className="px-6 pb-16">
          <div className="max-w-7xl mx-auto">
            <div
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory muv-scroll-row pb-2 -mx-6 px-6 sm:grid sm:grid-cols-3 lg:grid-cols-6 sm:overflow-visible sm:mx-0 sm:px-0"
              tabIndex={0}
              role="region"
              aria-label="Browse by category"
            >
              {categories.map((c, i) => {
                const Icon = CATEGORY_ICONS[c.slug] ?? Sparkles;
                return (
                  <Reveal key={c.id} delay={i * 0.05}>
                    <Link
                      href={c.comingSoon ? "#" : `/collections/${c.slug}`}
                      className="muv-card muv-card-hover flex-shrink-0 flex flex-col items-center text-center gap-2"
                      style={{ width: "min(150px, 40vw)", padding: "20px 14px" }}
                    >
                      <Icon size={22} strokeWidth={1.2} style={{ color: "var(--lavender)" }} />
                      <span className="muv-text-solid text-xs" style={{ fontWeight: 500 }}>{c.name}</span>
                      {c.comingSoon && <span className="muv-text-faint text-[10px] italic">Muving in soon</span>}
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ---- Featured collection ---- */}
      {featuredProducts.length > 0 && (
        <section className="muv-section-fade-top py-20 px-6" style={{ background: "var(--surface)" }}>
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-10">
              <div>
                <Reveal><p className="muv-eyebrow mb-3">Featured</p></Reveal>
                <Reveal delay={0.06}>
                  <h2 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(1.5rem,3vw,2rem)" }}>Curated picks</h2>
                </Reveal>
              </div>
              <a href="#all-products" className="muv-footer-link muv-text-meta hover:text-white text-xs uppercase tracking-widest inline-flex items-center gap-1">
                See everything <ArrowUpRight size={13} />
              </a>
            </div>
            <FeaturedProducts products={featuredProducts} wishlistedIds={wishlistedIds} />
          </div>
        </section>
      )}

      {/* ---- Full catalog ---- */}
      <section id="all-products" className="max-w-7xl mx-auto px-6 py-16 scroll-mt-24">
        <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3vw,2.2rem)" }}>All Products</h2>
        <ProductGrid products={shaped} wishlistedIds={wishlistedIds} initialSearch={q ?? ""} popularSearches={popularSearches} />
      </section>
    </div>
  );
}
