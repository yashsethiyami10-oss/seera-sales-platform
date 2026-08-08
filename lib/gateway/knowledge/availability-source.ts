import { prisma } from "@/lib/prisma";

export type LiveProductAvailability = {
  id: string;
  name: string;
  status: string;
  variants: {
    id: string;
    sku: string;
    size: string;
    price: number;
    mrp: number;
    quantity: number;
  }[];
};

/**
 * MUV AI Gateway (Phase 5.2, Module 3) — the ONLY function in this
 * Knowledge API that reads commercial data (price/MRP/stock), and it
 * reads it live, every call, directly from the real product catalog —
 * never from Knowledge Factory content. This is FR-001 (Knowledge
 * Factory Commercial Separation — see docs/knowledge-factory/
 * CONSTITUTION.md Article 2) enforced structurally at the API boundary:
 * there is no code path in this module that could return a static/cached
 * price, image, or stock figure as if it were verified knowledge.
 */
export async function fetchLiveAvailability(productId: string): Promise<LiveProductAvailability | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      status: true,
      variants: {
        select: {
          id: true,
          sku: true,
          size: true,
          price: true,
          mrp: true,
          inventory: { select: { quantity: true } },
        },
      },
    },
  });
  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    status: product.status,
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      price: v.price,
      mrp: v.mrp,
      quantity: v.inventory?.quantity ?? 0,
    })),
  };
}
