import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildMetadata, buildProductSchema, buildBreadcrumbSchema } from "@/lib/seo";
import { ProductDetailInteractive } from "@/components/storefront/product-detail-interactive";
import { TrustIndicators } from "@/components/storefront/trust-indicators";
import { ProductWhyChoose } from "@/components/storefront/product-why-choose";
import { ProductBenefits } from "@/components/storefront/product-benefits";
import { ProductIngredients } from "@/components/storefront/product-ingredients";
import { ProductHowToUse } from "@/components/storefront/product-how-to-use";
import { ProductHighlights } from "@/components/storefront/product-highlights";
import { ProductSpecs } from "@/components/storefront/product-specs";
import { ProductReviews } from "@/components/storefront/product-reviews";
import { ProductFAQ } from "@/components/storefront/product-faq";
import { ProductDeliveryInfo } from "@/components/storefront/product-delivery-info";
import { RecentlyViewed } from "@/components/storefront/recently-viewed";
import { StickyMobileCTA } from "@/components/storefront/sticky-mobile-cta";
import { FeaturedProducts, type FeaturedProduct } from "@/components/storefront/featured-products";
import { getSimilarProducts, getCoPurchasedProducts } from "@/lib/recommendations";
import { extractUSP } from "@/lib/utils/extract-usp";
import { Button } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/reveal";
import { ArrowRight } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({ where: { slug }, include: { content: true } });
  if (!product || product.status === "DRAFT") return buildMetadata({ title: "Product Not Found", path: `/products/${slug}`, noIndex: true });
  // Production Customer Content Layer (Founder Decision, Product Content
  // Architecture) is the ONLY source for customer-facing SEO copy — falls
  // back to the real product name (a fact, not placeholder text) when no
  // approved SEO content exists yet, never to the legacy Product columns.
  return buildMetadata({ title: product.content?.seoTitle || product.name, description: product.content?.seoDescription || product.content?.shortDescription || product.name, path: `/products/${product.slug}`, image: product.images[0], noIndex: product.status === "ARCHIVED" });
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Fetched without a status filter so a genuinely ARCHIVED product can be
  // told apart from one that never existed (PHASE_4C §5's "archived, never
  // hard-deleted" rule) — a discontinued product deserves a distinct,
  // honest message, not the same blank 404 as a typo'd URL.
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      variants: { include: { inventory: true }, orderBy: { price: "asc" } },
      reviews: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, include: { customer: { select: { id: true, name: true } } } },
      // Production Customer Content Layer — the ONLY source this page reads
      // customer-facing copy from (Founder Decision, Product Content
      // Architecture). Product's own shortDescription/fullDescription/
      // benefits/directions/safety columns are no longer read here.
      content: true,
    },
  });

  if (!product || product.status === "DRAFT") notFound();

  if (product.status === "ARCHIVED") {
    return (
      <div className="max-w-xl mx-auto px-6 py-32 text-center">
        <p className="muv-text-body text-[11px] uppercase tracking-[0.3em] mb-4">No Longer Available</p>
        <h1 className="font-display text-white mb-3" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3vw,2.2rem)" }}>{product.name} has been discontinued</h1>
        <p className="muv-text-meta text-sm mb-8">This product is no longer sold, but past orders referencing it remain intact in your order history.</p>
        <Link href={`/collections/${product.category.slug}`}><Button variant="ghost">Browse {product.category.name}</Button></Link>
      </div>
    );
  }

  // "Similar Products" (Phase 14A) — same category OR overlapping fragrance
  // notes, replacing the previous category-only query with the richer real
  // signal getSimilarProducts already computes; "Customers Also Bought" is a
  // genuinely different signal (real order co-occurrence), so it's a new
  // section below rather than a duplicate of this one.
  const [session, relatedRaw, coPurchasedRaw] = await Promise.all([
    auth(),
    getSimilarProducts(product.id, 4),
    getCoPurchasedProducts(product.id, 4),
  ]);

  let initialWishlisted = false;
  let wishlistedIds: string[] = [];
  if (session?.user) {
    const customer = await prisma.customer.findUnique({ where: { userId: session.user.id } });
    if (customer) {
      const entry = await prisma.wishlist.findUnique({ where: { customerId_productId: { customerId: customer.id, productId: product.id } } });
      initialWishlisted = !!entry;
      const recommendedIds = [...new Set([...relatedRaw.map((p) => p.id), ...coPurchasedRaw.map((p) => p.id)])];
      if (recommendedIds.length > 0) {
        const items = await prisma.wishlist.findMany({ where: { customerId: customer.id, productId: { in: recommendedIds } }, select: { productId: true } });
        wishlistedIds = items.map((i) => i.productId);
      }
    }
  }

  const variants = product.variants.map((v) => ({ id: v.id, size: v.size, price: v.price, mrp: v.mrp, sku: v.sku, quantity: v.inventory?.quantity ?? 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 10, inStock: (v.inventory?.quantity ?? 0) > 0, images: v.images }));
  const rating = product.reviews.length ? product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length : null;
  const cheapestVariant = variants[0];
  const allOutOfStock = variants.every((v) => v.quantity === 0);

  // "Verified Purchase" (Phase 18) — same real, derived-not-stored check
  // components/storefront/social-proof.tsx already uses: a review only
  // counts as verified if that exact customer has a real PAID order
  // containing this exact product, via one batched query, no schema change.
  const verifiedCustomerIds = product.reviews.length > 0
    ? new Set(
        (
          await prisma.orderItem.findMany({
            where: { order: { customerId: { in: product.reviews.map((r) => r.customer.id) }, paymentStatus: "PAID" }, variant: { productId: product.id } },
            select: { order: { select: { customerId: true } } },
          })
        ).map((it) => it.order.customerId)
      )
    : new Set<string>();

  // Shared by both recommendation rails below (Similar Products / Customers
  // Also Bought) so the FeaturedProduct-shaping logic isn't duplicated per
  // section — same mapping app/(storefront)/shop/page.tsx already uses.
  function toFeaturedProduct(p: (typeof relatedRaw)[number], i: number): FeaturedProduct {
    const sorted = [...p.variants].sort((a, b) => {
      const aIn = (a.inventory?.quantity ?? 0) > 0 ? 0 : 1;
      const bIn = (b.inventory?.quantity ?? 0) > 0 ? 0 : 1;
      return aIn !== bIn ? aIn - bIn : a.price - b.price;
    });
    const v = sorted[0];
    const variant = v ? { id: v.id, size: v.size, price: v.price, mrp: v.mrp, quantity: v.inventory?.quantity ?? 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 10 } : null;
    const pRating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : null;
    const badge: FeaturedProduct["badge"] = variant && variant.quantity > 0 && variant.quantity <= variant.lowStockThreshold ? "Limited" : i === 0 ? "New" : null;
    return { id: p.id, name: p.name, slug: p.slug, category: { name: p.category.name }, images: p.images, usp: extractUSP(p.content?.keyBenefits ?? null), badge, rating: pRating, reviewCount: p.reviews.length, variant };
  }

  const relatedProducts: FeaturedProduct[] = relatedRaw.map(toFeaturedProduct);
  const coPurchasedProducts: FeaturedProduct[] = coPurchasedRaw.map(toFeaturedProduct);

  const productSchema = buildProductSchema({ name: product.name, slug: product.slug, shortDescription: product.content?.shortDescription ?? product.name, imageUrl: product.images[0], rating, reviewCount: product.reviews.length, variants });
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Shop", path: "/shop" },
    { name: product.category.name, path: `/collections/${product.category.slug}` },
    { name: product.name, path: `/products/${product.slug}` },
  ]);

  return (
    <div className="max-w-7xl mx-auto px-6 pt-12 pb-24 lg:pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <Reveal>
        <p className="muv-text-meta text-xs uppercase tracking-wide mb-6">
          <Link href="/shop" className="muv-footer-link hover:text-white">Shop</Link> /{" "}
          <Link href={`/collections/${product.category.slug}`} className="muv-footer-link hover:text-white">{product.category.name}</Link> / {product.name}
        </p>
      </Reveal>

      {/* ---- 1. Product Hero — gallery + purchase panel share variant
          selection state (Sprint 2 Part 3: Variant Image Gallery), so
          switching size immediately swaps the gallery too. ---- */}
      <ProductDetailInteractive
        productId={product.id}
        productName={product.name}
        brandLine={`${product.brand} · ${product.category.name}${product.weight ? ` · ${product.weight}` : ""}`}
        shortDescription={product.content?.shortDescription}
        categoryName={product.category.name}
        fragranceNotes={product.fragranceNotes}
        fallbackImages={product.images}
        variants={variants}
        rating={rating}
        reviewCount={product.reviews.length}
        hsnCode={product.hsnCode}
        gstRate={product.gstRate}
        initialWishlisted={initialWishlisted}
      />

      {/* ---- 2. Trust Indicators ---- */}
      <TrustIndicators />

      {/* ---- 3. Why Choose MUV (this product) ---- */}
      <ProductWhyChoose fullDescription={product.content?.longDescription} categoryName={product.category.name} />

      {product.videoUrls.length > 0 && (
        <section className="mt-20 max-w-2xl">
          <h2 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Product Videos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {product.videoUrls.map((url) => (
              <video key={url} src={url} controls className="w-full rounded-xl" style={{ border: "1px solid var(--card-border)" }} />
            ))}
          </div>
        </section>
      )}

      {/* ---- 4. Benefits ---- */}
      <ProductBenefits benefits={product.content?.keyBenefits} />

      {/* ---- 4b. Highlights ---- */}
      <ProductHighlights highlights={product.content?.productHighlights} />

      {/* ---- 5. Ingredients / Key Actives ----
          No `ingredients` field exists on the Production Customer Content
          Layer (Founder Decision, Product Content Architecture) — real
          ingredient composition data found during investigation was the
          proprietary manufacturing batch formula, explicitly excluded from
          any customer-facing layer. This section stays hidden until a
          Founder-approved, customer-safe ingredient list exists somewhere
          to source it from. */}
      <ProductIngredients ingredients={null} />

      {/* ---- 6. How To Use ---- */}
      <ProductHowToUse directions={product.content?.howToUse} />

      {/* ---- 6b. Uses (ProductContent.careInstructions — Approved
          Requirements add-on: distinct from step-by-step How To Use above) ---- */}
      {product.content?.careInstructions && (
        <section className="mt-20 max-w-2xl">
          <p className="muv-eyebrow mb-3">Uses</p>
          <h2 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Uses</h2>
          <p className="muv-text-body text-sm" style={{ lineHeight: 1.7 }}>{product.content.careInstructions}</p>
        </section>
      )}

      {product.content?.safetyInformation && (
        <section className="mt-20 max-w-2xl">
          <p className="muv-eyebrow mb-3">Safety</p>
          <h2 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Safety Information</h2>
          <p className="muv-text-body text-sm" style={{ lineHeight: 1.7 }}>{product.content.safetyInformation}</p>
        </section>
      )}

      {product.content?.storage && (
        <section className="mt-20 max-w-2xl">
          <p className="muv-eyebrow mb-3">Storage</p>
          <h2 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Storage Information</h2>
          <p className="muv-text-body text-sm" style={{ lineHeight: 1.7 }}>{product.content.storage}</p>
        </section>
      )}

      {/* ---- 7. Product Specifications ---- */}
      <ProductSpecs categoryName={product.category.name} variantSize={cheapestVariant?.size} weight={product.weight} fragranceNotes={product.fragranceNotes} brand={product.brand} />

      {/* ---- 8. Related Products (Phase 14A: category + fragrance overlap) ---- */}
      {relatedProducts.length > 0 && (
        <section className="mt-20">
          <p className="muv-eyebrow mb-3">You May Also Like</p>
          <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.6rem" }}>More from {product.category.name}</h2>
          <FeaturedProducts products={relatedProducts} wishlistedIds={wishlistedIds} />
        </section>
      )}

      {/* ---- 8b. Customers Also Bought (Phase 14A — real order co-occurrence) ---- */}
      {coPurchasedProducts.length > 0 && (
        <section className="mt-20">
          <p className="muv-eyebrow mb-3">Frequently Bought Together</p>
          <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Customers also bought</h2>
          <FeaturedProducts products={coPurchasedProducts} wishlistedIds={wishlistedIds} />
        </section>
      )}

      {/* ---- 9. Recently Viewed ---- */}
      <RecentlyViewed current={{ slug: product.slug, name: product.name, image: product.images[0], price: cheapestVariant?.price ?? 0, categoryName: product.category.name, productId: product.id }} />

      {/* ---- 10. Reviews ---- */}
      <ProductReviews productId={product.id} productName={product.name} reviews={product.reviews.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, customerName: r.customer.name, createdAt: r.createdAt, isVerified: verifiedCustomerIds.has(r.customer.id) }))} />

      {/* ---- 11. FAQ ---- */}
      <ProductFAQ productFaqs={Array.isArray(product.content?.faq) ? (product.content.faq as { question: string; answer: string }[]) : null} />

      {/* ---- 12. Business Purchase CTA ---- */}
      <section className="mt-20">
        <div className="muv-business-panel flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="muv-text-solid text-sm font-medium mb-1.5">Buying {product.name} in bulk?</p>
            <p className="muv-text-meta text-sm">Hotels, restaurants, hospitals, laundry operations, and corporate offices can enquire for volume pricing.</p>
          </div>
          <Link href="/contact" className="flex-shrink-0">
            <Button variant="ghost">Enquire for business <ArrowRight size={15} /></Button>
          </Link>
        </div>
      </section>

      {/* ---- 13. Delivery Information ---- */}
      <ProductDeliveryInfo />

      {/* ---- 14. Sticky Mobile CTA ---- */}
      {cheapestVariant && <StickyMobileCTA productName={product.name} price={cheapestVariant.price} outOfStock={allOutOfStock} />}
    </div>
  );
}
