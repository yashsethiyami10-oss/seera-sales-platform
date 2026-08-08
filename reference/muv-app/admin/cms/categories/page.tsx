import { prisma } from "@/lib/prisma";
import { CategoriesTableClient } from "@/components/admin/categories-table-client";

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });

  const shaped = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: c.imageUrl,
    comingSoon: c.comingSoon,
    sortOrder: c.sortOrder,
    productCount: c._count.products,
  }));

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Categories</h1>
      <CategoriesTableClient categories={shaped} />
    </div>
  );
}
