import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { FoundationError } from "@/lib/foundation/errors";
import { material360, recommendedLot, lowStockMaterials, nearExpiryMaterials } from "@/lib/manufacturing/material-service";
import { materialLedger, lotLedger, materialStockPosition } from "@/lib/manufacturing/ledger-service";
import { bomDetail, activeBomFor, bomActivationImpact } from "@/lib/manufacturing/bom-service";
import { productionOrderDetail, materialAvailabilityGate } from "@/lib/manufacturing/production-order-service";
import { batchDetail } from "@/lib/manufacturing/batch-execution-service";
import { batchQcHistory } from "@/lib/manufacturing/qc-service";
import { materialRequirementPlan } from "@/lib/manufacturing/production-planning-service";
import { batchCostTrend } from "@/lib/manufacturing/costing-service";
import { authorize } from "@/lib/foundation/authorization-service";
import { getCompanyInventoryMode, companyStockPosition, cogsCoverageReport } from "@/lib/manufacturing/company-stock-service";
import { listMachines, listShifts } from "@/lib/manufacturing/machine-shift-service";
import { manufacturingDocumentsFor, type ManufacturingDocumentEntityType } from "@/lib/manufacturing/document-service";
import { manufacturingSearch } from "@/lib/manufacturing/search-service";
import * as reportsCenter from "@/lib/manufacturing/reports-center-service";
import { qcQueue } from "@/lib/manufacturing/qc-service";
import { wastageReport } from "@/lib/manufacturing/wastage-service";

function rangeFilter(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const productSkuId = url.searchParams.get("productSkuId") ?? undefined;
  const materialId = url.searchParams.get("materialId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  return { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined, productSkuId, materialId, status };
}

export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`manufacturing-reports:${user.id}`, 60, 60_000);
    const url = new URL(request.url);
    const report = url.searchParams.get("report");
    let result: unknown;

    switch (report) {
      case "material-360":
        result = await material360(prisma, user.id, url.searchParams.get("materialId") ?? "");
        break;
      case "material-ledger":
        result = await materialLedger(prisma, user.id, { materialId: url.searchParams.get("materialId") ?? "" });
        break;
      case "material-position":
        result = await materialStockPosition(prisma, url.searchParams.get("materialId") ?? "");
        break;
      case "lot-ledger":
        result = await lotLedger(prisma, user.id, url.searchParams.get("lotId") ?? "");
        break;
      case "recommended-lot":
        result = await recommendedLot(prisma, url.searchParams.get("materialId") ?? "");
        break;
      case "bom-detail":
        result = await bomDetail(prisma, user.id, url.searchParams.get("bomId") ?? "");
        break;
      case "active-bom":
        result = await activeBomFor(prisma, url.searchParams.get("productSkuId") ?? "");
        break;
      case "bom-activation-impact":
        result = await bomActivationImpact(prisma, url.searchParams.get("bomId") ?? "");
        break;
      case "production-order-detail":
        result = await productionOrderDetail(prisma, user.id, url.searchParams.get("orderId") ?? "");
        break;
      case "material-availability-gate":
        result = await materialAvailabilityGate(prisma, url.searchParams.get("orderId") ?? "");
        break;
      case "batch-detail":
        result = await batchDetail(prisma, user.id, url.searchParams.get("batchId") ?? "");
        break;
      case "batch-qc-history":
        result = await batchQcHistory(prisma, user.id, url.searchParams.get("batchId") ?? "");
        break;
      case "mrp":
        result = await materialRequirementPlan(prisma, user.id, url.searchParams.get("planLineId") ?? "");
        break;
      case "batch-cost-trend":
        result = await batchCostTrend(prisma, user.id, url.searchParams.get("productSkuId") ?? "");
        break;
      case "sku-list":
        await authorize(prisma, { actorId: user.id, permission: "mfg_ledger:view" });
        result = await prisma.seeraSku.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, productName: true }, orderBy: { productName: "asc" } });
        break;
      case "machines":
        result = await listMachines(prisma, user.id, url.searchParams.get("activeOnly") === "true");
        break;
      case "shifts":
        result = await listShifts(prisma, user.id, url.searchParams.get("activeOnly") === "true");
        break;
      case "company-inventory-mode":
        await authorize(prisma, { actorId: user.id, permission: "settings:manage" });
        result = { mode: await getCompanyInventoryMode(prisma) };
        break;
      case "company-stock-position":
        await authorize(prisma, { actorId: user.id, permission: "mfg_ledger:view" });
        result = await companyStockPosition(prisma, url.searchParams.get("skuId") ?? "");
        break;
      case "cogs-coverage": {
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        result = await cogsCoverageReport(prisma, user.id, { from: from ? new Date(from) : new Date(0), to: to ? new Date(to) : new Date() });
        break;
      }
      case "search":
        result = await manufacturingSearch(prisma, user.id, url.searchParams.get("q") ?? "");
        break;
      case "manufacturing-documents":
        result = await manufacturingDocumentsFor(prisma, user.id, (url.searchParams.get("entityType") ?? "") as ManufacturingDocumentEntityType, url.searchParams.get("entityId") ?? "");
        break;
      case "qc-queue":
        result = await qcQueue(prisma, user.id);
        break;
      case "qc-status-batches":
        result = await reportsCenter.qcStatusBatches(prisma, user.id, (url.searchParams.get("qcStatus") ?? "PENDING") as never);
        break;
      case "wastage-report": {
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        result = await wastageReport(prisma, user.id, { from: from ? new Date(from) : new Date(0), to: to ? new Date(to) : new Date() });
        break;
      }
      case "daily-production":
        result = await reportsCenter.dailyProductionReport(prisma, user.id, rangeFilter(url));
        break;
      case "product-wise-production":
        result = await reportsCenter.productWiseProductionReport(prisma, user.id, rangeFilter(url));
        break;
      case "plan-vs-actual":
        result = await reportsCenter.planVsActualReport(prisma, user.id, url.searchParams.get("planId") ?? "");
        break;
      case "production-order-register":
        result = await reportsCenter.productionOrderRegister(prisma, user.id, rangeFilter(url));
        break;
      case "batch-register":
        result = await reportsCenter.batchRegister(prisma, user.id, rangeFilter(url));
        break;
      case "shift-wise-output":
        result = await reportsCenter.shiftWiseOutputReport(prisma, user.id, rangeFilter(url));
        break;
      case "material-stock-report":
        result = await reportsCenter.materialStockReport(prisma, user.id, (url.searchParams.get("type") as never) ?? undefined);
        break;
      case "material-consumption":
        result = await reportsCenter.materialConsumptionReport(prisma, user.id, { ...rangeFilter(url), type: (url.searchParams.get("type") as never) ?? undefined });
        break;
      case "packaging-variance":
        result = await reportsCenter.packagingVarianceReport(prisma, user.id, rangeFilter(url));
        break;
      case "raw-material-variance":
        result = await reportsCenter.rawMaterialVarianceReport(prisma, user.id, rangeFilter(url));
        break;
      case "qc-pass-fail":
        result = await reportsCenter.qcPassFailReport(prisma, user.id, rangeFilter(url));
        break;
      case "batch-quality-history":
        result = await reportsCenter.batchQualityHistoryReport(prisma, user.id, rangeFilter(url));
        break;
      case "yield-report":
        result = await reportsCenter.yieldReport(prisma, user.id, rangeFilter(url));
        break;
      case "output-variance":
        result = await reportsCenter.outputVarianceReport(prisma, user.id, rangeFilter(url));
        break;
      case "batch-cost-report":
        result = await reportsCenter.batchCostReport(prisma, user.id, rangeFilter(url));
        break;
      case "product-cost-report":
        result = await reportsCenter.productCostReport(prisma, user.id, rangeFilter(url));
        break;
      case "cost-confidence":
        result = await reportsCenter.costConfidenceReport(prisma, user.id, rangeFilter(url));
        break;
      case "cost-exceptions":
        result = await reportsCenter.costExceptionsReport(prisma, user.id);
        break;
      case "raw-lot-to-finished-batches":
        result = await reportsCenter.rawLotToFinishedBatchesReport(prisma, user.id, url.searchParams.get("lotId") ?? "");
        break;
      case "finished-batch-to-company-dispatch":
        result = await reportsCenter.finishedBatchToCompanyDispatchReport(prisma, user.id, url.searchParams.get("batchId") ?? "");
        break;
      case "manufacturing-inventory-value":
        result = await reportsCenter.manufacturingInventoryValue(prisma, user.id);
        break;
      case "dashboard-attention-signals":
        result = await reportsCenter.dashboardAttentionSignals(prisma, user.id);
        break;
      case "product-360":
        result = await reportsCenter.product360(prisma, user.id, url.searchParams.get("productSkuId") ?? "");
        break;
      case "reorder-report":
        result = await lowStockMaterials(prisma, user.id);
        break;
      case "near-expiry-report":
        result = await nearExpiryMaterials(prisma, user.id, Number(url.searchParams.get("withinDays") ?? 30));
        break;
      default:
        throw new FoundationError("UNKNOWN_REPORT", "Unknown report requested", 400);
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
