import { z } from "zod";
import { PRODUCT_SIZES } from "@/lib/constants/sizes";

const productVariantBase = z.object({
  size: z.enum(PRODUCT_SIZES),
  price: z.number().int().positive("Price must be greater than 0"),
  mrp: z.number().int().positive("MRP must be greater than 0"),
  sku: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9-]+$/, "SKU may only contain uppercase letters, numbers, and hyphens"),
  initialStock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(10),
});
export const productVariantInput = productVariantBase.refine((v) => v.mrp >= v.price, {
  message: "MRP cannot be lower than the selling price",
  path: ["mrp"],
});

// Product Content Layer (ProductContent.faq — see prisma/schema.prisma) —
// already-existing storage, shape documented on the model itself as
// [{ question, answer, source }]. Reused as-is, no schema change.
export const faqEntrySchema = z.object({
  question: z.string().trim().min(1, "Question cannot be empty").max(300),
  answer: z.string().trim().min(1, "Answer cannot be empty").max(2000),
});

// Mirrors ProductContent's columns — the ONLY table the customer-facing
// Product Detail Page and generateMetadata() actually read customer-facing
// copy from (see the model's own doc comment in schema.prisma). Every field
// optional: a DRAFT product may have none of this yet.
export const productContentInputSchema = z.object({
  shortDescription: z.string().max(500).optional(),
  longDescription: z.string().max(5000).optional(),
  keyBenefits: z.string().max(2000).optional(),
  productHighlights: z.string().max(2000).optional(),
  howToUse: z.string().max(2000).optional(),
  // "Uses" (Approved Requirements Add-on) — reuses the existing, previously
  // unrendered/unexposed ProductContent.careInstructions column (already in
  // the schema and already returned by app/api/products/[slug]/route.ts) —
  // no migration needed. Distinct from `howToUse` (step-by-step directions)
  // and `storage` (where/how to store it).
  careInstructions: z.string().max(2000).optional(),
  storage: z.string().max(1000).optional(),
  safetyInformation: z.string().max(2000).optional(),
  seoTitle: z.string().max(70, "Keep it under 70 characters so it doesn't truncate in search results").optional(),
  seoDescription: z.string().max(160, "Keep it under 160 characters so it doesn't truncate in search results").optional(),
  faq: z.array(faqEntrySchema).max(30, "Up to 30 FAQs per product").optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(2, "Product name is too short").max(100),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens"),
  categoryId: z.string().cuid("Choose a category"),
  brand: z.string().min(1).max(60).default("MUV"),
  // Deliberately NOT a hard minimum here — a DRAFT product must be saveable
  // with this blank (Approved Requirements §4: "do not block Draft
  // saving"). Section-4's "required for ACTIVE" rule is enforced separately
  // in actions/products.ts, only when status ends up ACTIVE.
  shortDescription: z.string().max(500).optional(),
  fullDescription: z.string().max(5000).optional(),
  weight: z.string().max(40).optional(),
  fragranceNotes: z.string().max(200).optional(),
  ingredients: z.string().max(2000).optional(),
  directions: z.string().max(1000).optional(),
  benefits: z.string().max(1000).optional(),
  safety: z.string().max(1000).optional(),
  hsnCode: z.string().min(4).max(10).default("3401"),
  gstRate: z.number().int().min(0).max(28).default(18),
  metaTitle: z.string().max(70, "Keep it under 70 characters so it doesn't truncate in search results").optional(),
  metaDescription: z.string().max(160, "Keep it under 160 characters so it doesn't truncate in search results").optional(),
  images: z
    .array(z.string().url())
    .max(20, "Up to 20 images per product")
    .refine((arr) => new Set(arr).size === arr.length, "The same image is mapped more than once")
    .default([]),
  videoUrls: z.array(z.string().url()).max(4, "Up to 4 videos per product").default([]),
  isFeatured: z.boolean().default(false),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).default("DRAFT"),
  variants: z.array(productVariantInput).min(1, "Add at least one size/SKU"),
  // Production Customer Content Layer — optional sub-object; omitted
  // entirely means "leave existing content record untouched" on update.
  content: productContentInputSchema.optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().cuid(),
});

export const productQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().max(100).optional(),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional(),
  sort: z.enum(["featured", "price-asc", "price-desc", "name"]).default("featured"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Variant-level mutations, used once a product already exists — creating a
// product still requires at least one variant up front (createProductSchema
// above); these cover editing an existing variant's price/SKU/size and
// stock, and adding further sizes to a product that already has variants.
// Previously the admin form only ever wrote variants at creation time and
// hid this section entirely when editing — every field must be editable
// after saving, so these two exist now.
export const updateVariantSchema = z.object({
  variantId: z.string().cuid(),
  size: z.enum(PRODUCT_SIZES).optional(),
  price: z.number().int().positive().optional(),
  mrp: z.number().int().positive().optional(),
  sku: z.string().min(3).max(40).regex(/^[A-Z0-9-]+$/).optional(),
});

export const addVariantSchema = z.object({
  productId: z.string().cuid(),
  ...productVariantBase.shape,
}).refine((v) => v.mrp >= v.price, {
  message: "MRP cannot be lower than the selling price",
  path: ["mrp"],
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;

/**
 * Approved Requirements §4 ("Field Validation") — mandatory fields for
 * saving a Product with status ACTIVE. Deliberately NOT part of
 * createProductSchema/updateProductSchema themselves (those must stay
 * satisfiable by a DRAFT with blank fields) — called explicitly from
 * actions/products.ts only when the *effective* status (after this save)
 * is ACTIVE, against the *effective* field values (existing DB row merged
 * with whatever this request changes), never against the request payload
 * alone — a partial update that only touches `images` must not report
 * "missing SEO title" if the product already has one saved.
 *
 * There is no independent "active/inactive" flag on ProductVariant in the
 * schema (see prisma/schema.prisma) — every variant row that exists is by
 * definition sellable, so "at least one active Variant" is checked as "at
 * least one variant row exists," not invented as a new concept.
 */
export function validateActiveProductRequirements(effective: {
  name?: string | null;
  categoryId?: string | null;
  images?: string[] | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  howToUse?: string | null;
  safetyInformation?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  variants: { size?: string | null; sku?: string | null; price?: number | null; mrp?: number | null }[];
}): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const req = (val: string | null | undefined, field: string, label: string) => {
    if (!val || !val.trim()) errors[field] = [`${label} is required to activate this product`];
  };

  req(effective.name, "name", "Product name");
  req(effective.categoryId, "categoryId", "Category");
  req(effective.shortDescription, "content.shortDescription", "Short description");
  req(effective.fullDescription, "content.longDescription", "Full description");
  req(effective.howToUse, "content.howToUse", "Directions for use");
  req(effective.safetyInformation, "content.safetyInformation", "Safety information");
  req(effective.seoTitle, "content.seoTitle", "SEO title");
  req(effective.seoDescription, "content.seoDescription", "SEO description");

  if (!effective.images || effective.images.length === 0) {
    errors.images = ["At least one product image (and a cover image) is required to activate this product"];
  }

  if (!effective.variants || effective.variants.length === 0) {
    errors.variants = ["At least one variant is required to activate this product"];
  } else {
    const variantIssues: string[] = [];
    effective.variants.forEach((v, i) => {
      if (!v.size) variantIssues.push(`Variant ${i + 1}: pack size is required`);
      if (!v.sku || !v.sku.trim()) variantIssues.push(`Variant ${i + 1}: SKU is required`);
      if (v.mrp == null) variantIssues.push(`Variant ${i + 1}: MRP is required`);
      if (v.price == null) variantIssues.push(`Variant ${i + 1}: selling price is required`);
    });
    if (variantIssues.length > 0) errors.variants = variantIssues;
  }

  return errors;
}