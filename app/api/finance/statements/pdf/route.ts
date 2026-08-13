import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { FoundationError } from "@/lib/foundation/errors";
import { trialBalance } from "@/lib/finance/journal-service";
import { profitAndLoss, balanceSheet, cashFlow, gstControlCenter } from "@/lib/finance/statements-service";
import { renderStatementPdf } from "@/lib/finance/statement-pdf";

const money = (v: number) => `Rs. ${Math.round(v).toLocaleString("en-IN")}`;

export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`finance-statement-pdf:${user.id}`, 20, 60_000);
    const url = new URL(request.url);
    const statement = url.searchParams.get("statement");
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date("2000-01-01");
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();
    let title = "";
    let subtitle = `${from.toLocaleDateString("en-IN")} to ${to.toLocaleDateString("en-IN")}`;
    let rows: { label: string; value: string; indent?: boolean }[] = [];

    if (statement === "trial-balance") {
      const tb = await trialBalance(prisma, user.id, to);
      title = "Trial Balance";
      subtitle = `As of ${to.toLocaleDateString("en-IN")}`;
      rows = [...tb.rows.map((r) => ({ label: `${r.code} — ${r.name}`, value: `Dr ${money(r.closingDebit)} / Cr ${money(r.closingCredit)}`, indent: true })), { label: "TOTAL", value: `Dr ${money(tb.totalDebit)} / Cr ${money(tb.totalCredit)}` }];
    } else if (statement === "pl") {
      const pnl = await profitAndLoss(prisma, user.id, from, to);
      title = "Profit & Loss";
      rows = [
        { label: "Revenue (RELIABLE)", value: money(pnl.totalRevenue) },
        ...pnl.revenue.map((r) => ({ label: r.name, value: money(r.amount), indent: true })),
        { label: "Operating Expense", value: money(pnl.totalOperatingExpense) },
        ...pnl.operatingExpense.map((r) => ({ label: r.name, value: money(r.amount), indent: true })),
        { label: "Operating Profit", value: money(pnl.operatingProfit) },
        { label: "Net Result (PARTIAL)", value: pnl.cogsNote },
      ];
    } else if (statement === "bs") {
      const bs = await balanceSheet(prisma, user.id, to);
      title = "Balance Sheet";
      subtitle = `As of ${to.toLocaleDateString("en-IN")}`;
      rows = [
        { label: "ASSETS", value: money(bs.totalAssets) },
        ...bs.assets.map((r) => ({ label: r.name, value: money(r.amount), indent: true })),
        { label: "LIABILITIES", value: money(bs.totalLiabilities) },
        ...bs.liabilities.map((r) => ({ label: r.name, value: money(r.amount), indent: true })),
        { label: "EQUITY", value: money(bs.totalEquity) },
        ...bs.equity.map((r) => ({ label: r.name, value: money(r.amount), indent: true })),
        { label: bs.balanced ? "Balanced" : "MISMATCH", value: "" },
      ];
    } else if (statement === "cf") {
      const cf = await cashFlow(prisma, user.id, from, to);
      title = "Cash Flow";
      rows = [
        { label: "Opening Cash", value: money(cf.openingCash) },
        { label: "Operating", value: money(cf.operating) },
        { label: "Investing", value: money(cf.investing) },
        { label: "Financing", value: money(cf.financing) },
        { label: "Closing Cash", value: money(cf.closingCash) },
      ];
    } else if (statement === "gst") {
      const gst = await gstControlCenter(prisma, user.id, from, to);
      title = "GST Summary";
      rows = [
        { label: "Output CGST", value: money(gst.outputCgst) },
        { label: "Output SGST", value: money(gst.outputSgst) },
        { label: "Output IGST", value: money(gst.outputIgst) },
        { label: "Input CGST", value: money(gst.inputCgst) },
        { label: "Input SGST", value: money(gst.inputSgst) },
        { label: "Input IGST", value: money(gst.inputIgst) },
        { label: "Net Indicative Liability", value: money(gst.netIndicativeLiability) },
      ];
    } else {
      throw new FoundationError("UNKNOWN_STATEMENT", "Unknown statement requested", 400);
    }

    const bytes = await renderStatementPdf({ title, subtitle, rows, footer: "Seera Company Finance OS — internal export, not a statutory filing document." });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${title.replace(/\s+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
