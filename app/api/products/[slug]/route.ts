import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, statusForError, NotFoundError } from "@/lib/errors";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params; // Next.js 15: route params are async

    const product = await prisma.product.findUnique({
      where: { slug, status: "ACTIVE" },
      include: {
        category: { select: { name: true, slug: true } },
        variants: { include: { inventory: true }, orderBy: { price: "asc" } },
        reviews: {
          where: { status: "APPROVED" },
          orderBy: { createdAt: "desc" },
          include: { customer: { select: { name: true } } },
        },
        // Production Customer Content Layer — the only source of customer-
        // facing copy this public endpoint returns (Founder Decision,
        // Product Content Architecture).
        content: true,
      },
    });

    if (!product) throw new NotFoundError("Product");

    const avgRating = product.reviews.length
      ? product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length
      : null;

    return NextResponse.json({
      success: true,
      data: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        shortDescription: product.content?.shortDescription ?? null,
        longDescription: product.content?.longDescription ?? null,
        fragranceNotes: product.fragranceNotes,
        keyBenefits: product.content?.keyBenefits ?? null,
        howToUse: product.content?.howToUse ?? null,
        careInstructions: product.content?.careInstructions ?? null,
        storage: product.content?.storage ?? null,
        safetyInformation: product.content?.safetyInformation ?? null,
        productHighlights: product.content?.productHighlights ?? null,
        faq: product.content?.faq ?? null,
        rating: avgRating,
        variants: product.variants.map((v) => ({
          id: v.id,
          size: v.size,
          price: v.price,
          mrp: v.mrp,
          inStock: (v.inventory?.quantity ?? 0) > 0,
        })),
        reviews: product.reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          body: r.body,
          customerName: r.customer.name,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json(toErrorResponse(err), { status: statusForError(err) });
  }
}
