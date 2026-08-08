import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listFormulas } from "@/actions/manufacturing";
import { FormulaManager } from "@/components/os-manufacturing/FormulaManager";

export default async function FormulasPage() {
  const [formulasResult, variants] = await Promise.all([
    listFormulas({ pageSize: 50 }),
    prisma.productVariant.findMany({ take: 300, select: { id: true, sku: true, size: true, product: { select: { name: true } } }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Formula & BOM" description="Only an ACTIVE formula revision can back a Production Order" />
      <div className="px-6 pb-10">
        {formulasResult.success ? (
          <FormulaManager initialFormulas={formulasResult.data.items} variants={variants.map((v) => ({ id: v.id, label: `${v.product.name} — ${v.size} (${v.sku})` }))} />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{formulasResult.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
