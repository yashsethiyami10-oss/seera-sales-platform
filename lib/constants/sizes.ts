/**
 * The complete, supported product size list — the one place this is
 * defined. Previously this list was duplicated independently in
 * lib/validations/product.ts and components/admin/product-form-modal.tsx
 * (with a third, looser copy in a schema.prisma comment) — all three now
 * import from here instead of maintaining their own copy, so adding a size
 * in the future is a one-line change, not a three-file hunt.
 *
 * `size` on ProductVariant is a plain Prisma `String`, not a database enum
 * — this list is enforced at the Zod validation layer (see
 * lib/validations/product.ts), not the database. That's deliberate: it
 * means an existing product with an older/different size string already in
 * the database is never invalidated or blocked from rendering — Prisma
 * doesn't know or care what's "valid," it just stores what's there. Only
 * *new* writes through createProduct/updateProduct are constrained to this
 * list.
 */
export const PRODUCT_SIZES = ["30ml", "50ml", "100ml", "250ml", "500ml", "950ml", "1L", "2L", "5L", "10L", "20L"] as const;

export type ProductSize = (typeof PRODUCT_SIZES)[number];