import { prisma } from "@/lib/prisma";
import { ProductsTableClient } from "@/components/admin/products-table-client";

export default async function AdminProductsPage() {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      include: { category: true, content: true, variants: { include: { inventory: true }, orderBy: { price: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const shaped = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    categoryId: p.categoryId,
    category: p.category.name,
    brand: p.brand,
    shortDescription: p.shortDescription,
    fullDescription: p.fullDescription ?? undefined,
    weight: p.weight ?? undefined,
    fragranceNotes: p.fragranceNotes ?? undefined,
    ingredients: p.ingredients ?? undefined,
    directions: p.directions ?? undefined,
    benefits: p.benefits ?? undefined,
    safety: p.safety ?? undefined,
    hsnCode: p.hsnCode,
    gstRate: p.gstRate,
    metaTitle: p.metaTitle ?? undefined,
    metaDescription: p.metaDescription ?? undefined,
    // Production Customer Content Layer — the ONLY source the customer-
    // facing Product Detail Page and generateMetadata() actually read
    // customer-facing copy from. Passed through so the edit modal can
    // pre-fill with what's really live on the storefront, not the inert
    // legacy Product columns above.
    content: p.content
      ? {
          shortDescription: p.content.shortDescription ?? undefined,
          longDescription: p.content.longDescription ?? undefined,
          keyBenefits: p.content.keyBenefits ?? undefined,
          productHighlights: p.content.productHighlights ?? undefined,
          howToUse: p.content.howToUse ?? undefined,
          careInstructions: p.content.careInstructions ?? undefined,
          storage: p.content.storage ?? undefined,
          safetyInformation: p.content.safetyInformation ?? undefined,
          seoTitle: p.content.seoTitle ?? undefined,
          seoDescription: p.content.seoDescription ?? undefined,
          faq: Array.isArray(p.content.faq) ? (p.content.faq as { question: string; answer: string }[]) : [],
        }
      : undefined,
    images: p.images,
    videoUrls: p.videoUrls,
    isFeatured: p.isFeatured,
    status: p.status,
    price: p.variants[0]?.price ?? 0,
    stock: p.variants.reduce((sum, v) => sum + (v.inventory?.quantity ?? 0), 0),
    // Full variant list (not just the cheapest, used for the summary price
    // above) — the edit modal needs every existing size/SKU/price/stock row
    // to pre-fill "Existing Sizes", not just re-derive it from the summary.
    variants: p.variants.map((v) => ({
      id: v.id,
      size: v.size,
      price: v.price,
      mrp: v.mrp,
      sku: v.sku,
      stock: v.inventory?.quantity ?? 0,
      lowStockThreshold: v.inventory?.lowStockThreshold ?? 10,
    })),
  }));

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Products</h1>
      <ProductsTableClient products={shaped} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
