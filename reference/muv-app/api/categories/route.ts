import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, statusForError } from "@/lib/errors";

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        comingSoon: true,
        _count: { select: { products: { where: { status: "ACTIVE" } } } },
      },
    });

    return NextResponse.json({
      success: true,
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        comingSoon: c.comingSoon,
        productCount: c._count.products,
      })),
    });
  } catch (err) {
    return NextResponse.json(toErrorResponse(err), { status: statusForError(err) });
  }
}
