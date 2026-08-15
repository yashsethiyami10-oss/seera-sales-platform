import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { FoundationError } from "@/lib/foundation/errors";
import { renderStatementPdf } from "@/lib/finance/statement-pdf";
import { batchDetail } from "@/lib/manufacturing/batch-execution-service";
import { batchQcHistory } from "@/lib/manufacturing/qc-service";
import { finishedBatchToCompanyDispatchReport, dailyProductionReport, qcPassFailReport } from "@/lib/manufacturing/reports-center-service";

const num = (v: unknown) => Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });

export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`manufacturing-report-pdf:${user.id}`, 20, 60_000);
    const url = new URL(request.url);
    const report = url.searchParams.get("report");
    const batchId = url.searchParams.get("batchId") ?? "";
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date(Date.now() - 30 * 86_400_000);
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();
    let title = "";
    let subtitle = "";
    let rows: { label: string; value: string; indent?: boolean }[] = [];

    if (report === "batch-summary") {
      const detail = await batchDetail(prisma, user.id, batchId);
      title = "Batch Summary";
      subtitle = `Batch ${detail.batch.batchNumber} — ${new Date(detail.batch.date).toLocaleDateString("en-IN")}`;
      rows = [
        { label: "Status", value: `${detail.batch.status} / QC ${detail.batch.qcStatus}` },
        { label: "Planned Quantity", value: num(detail.batch.plannedQuantity) },
        { label: "Actual Output", value: detail.batch.actualOutputQuantity != null ? num(detail.batch.actualOutputQuantity) : "DATA REQUIRED" },
        { label: "Yield", value: detail.batch.yieldPct != null ? `${detail.batch.yieldPct}%` : "DATA REQUIRED" },
        { label: "MATERIAL CONSUMPTION", value: "" },
        ...detail.consumptionVariance.map((v) => ({ label: v.materialId, value: `Theoretical ${num(v.theoretical)} / Actual ${num(v.actual)} / Variance ${num(v.variance)}`, indent: true })),
        { label: "WASTAGE", value: detail.wastage.length === 0 ? "None recorded" : "" },
        ...detail.wastage.map((w) => ({ label: w.wastageType, value: num(w.wasteQuantity), indent: true })),
        { label: "FINISHED GOODS", value: detail.fgReceipt ? `${num(detail.fgReceipt.quantity)} — QC ${detail.fgReceipt.qcStatus}` : "DATA REQUIRED" },
      ];
    } else if (report === "qc-summary") {
      const result = await qcPassFailReport(prisma, user.id, { from, to });
      title = "QC Summary";
      subtitle = `${from.toLocaleDateString("en-IN")} to ${to.toLocaleDateString("en-IN")}`;
      rows = [
        { label: "Total QC Entries", value: String(result.total) },
        { label: "Passed", value: String(result.passed) },
        { label: "Failed", value: String(result.failed) },
        { label: "Untested", value: String(result.untested) },
        { label: "DETAIL", value: "" },
        ...result.rows.map((r) => ({ label: `${r.batchId ?? "—"} — ${r.parameter}`, value: r.passFail === null ? "UNTESTED" : r.passFail ? "PASS" : "FAIL", indent: true })),
      ];
    } else if (report === "traceability") {
      const [detail, dispatch] = await Promise.all([batchDetail(prisma, user.id, batchId), finishedBatchToCompanyDispatchReport(prisma, user.id, batchId)]);
      title = "Batch Traceability";
      subtitle = `Batch ${detail.batch.batchNumber} — Raw Lot → Batch → Company Dispatch → S.S.`;
      rows = [
        { label: "RAW MATERIAL CONSUMPTION (backward trace)", value: "" },
        ...detail.events.filter((e) => e.kind === "CONSUMPTION").map((e) => ({ label: e.materialId, value: `Qty ${num(e.canonicalQuantity)}${e.theoreticalQuantity ? ` (theoretical ${num(e.theoreticalQuantity)})` : ""}`, indent: true })),
        { label: "FINISHED GOODS", value: detail.fgReceipt ? `${num(detail.fgReceipt.quantity)} — QC ${detail.fgReceipt.qcStatus}` : "DATA REQUIRED" },
        { label: "COMPANY DISPATCH → S.S. (forward trace)", value: dispatch.dispatches.length === 0 ? "No dispatches yet" : "" },
        ...dispatch.dispatches.map((d) => ({ label: `${d.orderNumber} → ${d.superStockist}`, value: `Qty ${num(d.quantity)} — Cost ${d.unitCost != null ? num(d.unitCost) : "COST_BASIS_REQUIRED"} (${d.costConfidence})`, indent: true })),
      ];
    } else if (report === "production-summary") {
      const production = await dailyProductionReport(prisma, user.id, { from, to });
      title = "Production Summary";
      subtitle = `${from.toLocaleDateString("en-IN")} to ${to.toLocaleDateString("en-IN")}`;
      const totalOutput = production.reduce((s, b) => s + (b.actualOutputQuantity ?? 0), 0);
      rows = [
        { label: "Total Batches", value: String(production.length) },
        { label: "Total Output", value: num(totalOutput) },
        { label: "BATCHES", value: "" },
        ...production.map((b) => ({ label: `${b.batchNumber} — ${new Date(b.date).toLocaleDateString("en-IN")}`, value: `${b.status} / QC ${b.qcStatus} — Output ${b.actualOutputQuantity != null ? num(b.actualOutputQuantity) : "—"}`, indent: true })),
      ];
    } else {
      throw new FoundationError("UNKNOWN_REPORT", "Unknown Manufacturing PDF report requested", 400);
    }

    const bytes = await renderStatementPdf({ title, subtitle, rows, footer: "Seera Manufacturing OS — internal export, TEST/UAT use." });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${title.replace(/\s+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
