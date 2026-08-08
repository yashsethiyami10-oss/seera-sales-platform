import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listTaxRates } from "@/actions/finance";
import { TaxManager } from "@/components/os-finance/TaxManager";

export default async function TaxPage() {
  const [ratesResult, jurisdictions, taxTypes] = await Promise.all([
    listTaxRates(),
    prisma.financeTaxJurisdiction.findMany({ where: { organizationKey: "MUV", active: true } }),
    prisma.financeTaxType.findMany({ where: { organizationKey: "MUV", active: true } }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Tax & Compliance" description="Extensible tax framework — GST/TDS/TCS/withholding — structural only, no statutory filing" />
      <div className="px-6 pb-10">
        {ratesResult.success ? (
          <TaxManager rates={ratesResult.data.map((r) => ({ id: r.id, code: r.code, ratePercent: Number(r.ratePercent), taxType: { name: r.taxType.name }, jurisdiction: { name: r.jurisdiction.name } }))} jurisdictions={jurisdictions} taxTypes={taxTypes} />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{ratesResult.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
