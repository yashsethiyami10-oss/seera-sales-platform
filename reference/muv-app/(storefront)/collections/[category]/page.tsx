import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildMetadata, buildBreadcrumbSchema } from "@/lib/seo";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/primitives";
import { ProductGrid } from "@/components/storefront/product-grid";
import { getPopularSearches } from "@/actions/search";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = await prisma.category.findUnique({ where: { slug: category } });
  if (!cat) return buildMetadata({ title: "Collection", path: `/collections/${category}` });
  return buildMetadata({ title: cat.name, description: `${cat.name} from Muv — every product, real stock status, real pricing.`, path: `/collections/${cat.slug}` });
}

/**
 * Category has no `description` field in the schema (checked) — rather than
 * add one unprompted, this is honest, brand-voice copy (same treatment as
 * components/storefront/brand-story.tsx) keyed by slug, not a fabricated
 * per-product claim. Add a real `description` column later if this needs to
 * become admin-editable.
 */
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "home-care": "For the spaces you keep coming back to — surfaces, floors, and the daily upkeep that makes a home feel cared for, not just clean.",
  "fabric-care": "Detergents and fabric treatments built to be gentle on what you wear and honest about what they actually remove.",
  "body-care": "Wash and body essentials, formulated for daily use — real ingredients, listed plainly.",
  "personal-care": "The small daily rituals — hair, skin, and personal essentials, held to the same standard as everything else Muv makes.",
  "car-care": "Cleaning and maintenance for the vehicle you rely on, from the same brand that holds every category to one standard.",
};

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<{ q?: string }> }) {
  const { category } = await params;
  const { q } = await searchParams;
  const cat = await prisma.category.findUnique({ where: { slug: category } });
  if (!cat) notFound();

  if (cat.comingSoon) {
    return (
      <div className="max-w-xl mx-auto px-6 py-32 text-center">
        <p className="muv-text-body text-[11px] uppercase tracking-[0.3em] mb-4">Muving Soon™</p>
        <h1 className="font-display text-white mb-3" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3vw,2.2rem)" }}>{cat.name} is almost here</h1>
        <p className="muv-text-meta text-sm mb-8">Check back soon, or explore what's already live.</p>
        <Link href="/shop"><Button variant="ghost">Explore what's live</Button></Link>
      </div>
    );
  }

  const products = await prisma.product.findMany({
    where: { status: "ACTIVE", categoryId: cat.id },
    include: {
      category: { select: { name: true, slug: true } },
      variants: { include: { inventory: true }, orderBy: { price: "asc" } },
      reviews: { where: { status: "APPROVED" }, select: { rating: true } },
      content: { select: { shortDescription: true, searchKeywords: true } },
    },
  });

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

  const [session, popularSearches] = await Promise.all([auth(), getPopularSearches()]);
  let wishlistedIds: string[] = [];
  if (session?.user) {
    const customer = await prisma.customer.findUnique({ where: { userId: session.user.id } });
    if (customer) {
      const items = await prisma.wishlist.findMany({ where: { customerId: customer.id }, select: { productId: true } });
      wishlistedIds = items.map((i) => i.productId);
    }
  }

  const breadcrumbSchema = buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }, { name: cat.name, path: `/collections/${cat.slug}` }]);

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* ---- Hero ---- */}
      <section className="px-6" style={{ paddingTop: 96, paddingBottom: 56 }}>
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <p className="muv-text-meta text-xs uppercase tracking-widest mb-3">
              <Link href="/shop" className="muv-footer-link hover:text-white">Shop</Link> / {cat.name}
            </p>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="font-display text-white mb-4" style={{ fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3rem)" }}>{cat.name}</h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="muv-text-body" style={{ fontWeight: 300, fontSize: "16px", lineHeight: 1.8, maxWidth: "56ch" }}>
              {CATEGORY_DESCRIPTIONS[cat.slug] ?? `Browse every ${cat.name} product from Muv.`}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---- Collection grid ---- */}
      <section className="max-w-7xl mx-auto px-6 pb-16">
        <ProductGrid products={shaped} wishlistedIds={wishlistedIds} initialSearch={q ?? ""} popularSearches={popularSearches} />
      </section>

      {/* ---- Closing CTA — bulk/business path, same pattern as
          components/storefront/business-section.tsx, not duplicated verbatim
          since this is category-specific copy. ---- */}
      <section className="px-6 pb-20">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="muv-business-panel flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <p className="muv-text-solid text-sm font-medium mb-1.5">Buying {cat.name} in bulk?</p>
                <p className="muv-text-meta text-sm">Hotels, hospitals, restaurants, and other businesses can enquire for volume pricing.</p>
              </div>
              <Link href="/contact" className="flex-shrink-0">
                <Button variant="ghost">Enquire for business <ArrowRight size={15} /></Button>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
