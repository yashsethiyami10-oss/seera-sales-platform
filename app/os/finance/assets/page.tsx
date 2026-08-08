import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listFixedAssets, listPendingDepreciationEntries } from "@/actions/finance";
import { FixedAssetsManager } from "@/components/os-finance/FixedAssetsManager";

export default async function FixedAssetsPage() {
  const [assetsResult, entriesResult, categories] = await Promise.all([
    listFixedAssets({ pageSize: 50 }),
    listPendingDepreciationEntries(),
    prisma.financeAssetCategory.findMany({ where: { organizationKey: "MUV", status: "ACTIVE" } }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Fixed Assets & Depreciation" description="Straight-line depreciation, extensible to other methods without redesign" />
      <div className="px-6 pb-10">
        {assetsResult.success && entriesResult.success ? (
          <FixedAssetsManager
            assets={assetsResult.data.items.map((a) => ({ id: a.id, assetCode: a.assetCode, name: a.name, status: a.status, cost: Number(a.cost), accumulatedDepreciation: Number(a.accumulatedDepreciation), netBookValue: Number(a.netBookValue) }))}
            categories={categories}
            pendingEntries={entriesResult.data.map((e) => ({ id: e.id, assetCode: e.asset.assetCode, plannedAmount: Number(e.plannedAmount), fiscalPeriodId: e.fiscalPeriodId }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!assetsResult.success ? assetsResult.error.message : !entriesResult.success ? entriesResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
