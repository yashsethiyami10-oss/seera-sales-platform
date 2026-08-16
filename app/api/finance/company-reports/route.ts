import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { FoundationError } from "@/lib/foundation/errors";
import { salesRegister, companyFacingParties, customerAdvanceRegister, receiptsRegister, receivablesAgeing, expenseByCategory, expenseByDepartment, monthlyExpenseTrend, marketingSpendReport, companySalesBySS, companySalesByProduct } from "@/lib/finance/reports-service";
import { financeGlobalSearch } from "@/lib/finance/search-service";
import { financialIntelligenceFeed } from "@/lib/finance/intelligence-service";
import { journalDetail, recentJournals } from "@/lib/finance/journal-service";
import { loanLedger } from "@/lib/finance/loan-asset-service";
import { financeApprovalQueue } from "@/lib/finance/approval-policy-service";
import { financeDocumentVault, financeDocumentsFor, type FinanceDocumentEntityType } from "@/lib/finance/document-service";
import { ledgerReadModel } from "@/lib/sales-distribution/financial-service";
import { listRecurringTemplates } from "@/lib/finance/expense-service";
import { payrollRegister } from "@/lib/finance/payroll-service";
import { quickEntryCategories, categoryLedger, employeeFinancial360, searchEmployees } from "@/lib/finance/quick-entry-service";

// Read-only GET route (no mutation, so no Origin/CSRF concern — matches the
// existing /api/health/* convention). Every function called here still
// enforces its own authorize() permission check; this route only resolves
// identity + dispatches, it never widens access.
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`finance-company-reports:${user.id}`, 60, 60_000);
    const url = new URL(request.url);
    const report = url.searchParams.get("report");
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date("2000-01-01");
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();
    let result: unknown;

    switch (report) {
      case "sales-register":
        result = await salesRegister(prisma, user.id, { from, to });
        break;
      case "parties":
        result = await companyFacingParties(prisma, user.id);
        break;
      case "party-ledger": {
        const partyId = url.searchParams.get("partyId");
        if (!partyId) throw new FoundationError("PARTY_ID_REQUIRED", "partyId is required", 400);
        result = await ledgerReadModel(prisma, user.id, { partyType: "SUPER_STOCKIST", partyId });
        break;
      }
      case "customer-advances":
        result = await customerAdvanceRegister(prisma, user.id);
        break;
      case "receipts":
        result = await receiptsRegister(prisma, user.id);
        break;
      case "receivables-ageing":
        result = await receivablesAgeing(prisma, user.id);
        break;
      case "expense-by-category":
        result = await expenseByCategory(prisma, user.id, { from, to });
        break;
      case "expense-by-department":
        result = await expenseByDepartment(prisma, user.id, { from, to });
        break;
      case "expense-trend":
        result = await monthlyExpenseTrend(prisma, user.id, Number(url.searchParams.get("months") ?? 6));
        break;
      case "marketing-spend":
        result = await marketingSpendReport(prisma, user.id, { from, to });
        break;
      case "sales-by-ss":
        result = await companySalesBySS(prisma, user.id, { from, to });
        break;
      case "sales-by-product":
        result = await companySalesByProduct(prisma, user.id, { from, to });
        break;
      case "search":
        result = await financeGlobalSearch(prisma, user.id, url.searchParams.get("q") ?? "");
        break;
      case "intelligence":
        result = await financialIntelligenceFeed(prisma, user.id);
        break;
      case "recent-journals":
        result = await recentJournals(prisma, user.id, Number(url.searchParams.get("limit") ?? 30));
        break;
      case "journal-detail": {
        const journalId = url.searchParams.get("journalId");
        if (!journalId) throw new FoundationError("JOURNAL_ID_REQUIRED", "journalId is required", 400);
        result = await journalDetail(prisma, user.id, journalId);
        break;
      }
      case "loan-ledger": {
        const loanId = url.searchParams.get("loanId");
        if (!loanId) throw new FoundationError("LOAN_ID_REQUIRED", "loanId is required", 400);
        result = await loanLedger(prisma, user.id, loanId);
        break;
      }
      case "payroll-register": {
        const month = url.searchParams.get("month");
        if (!month) throw new FoundationError("MONTH_REQUIRED", "month is required", 400);
        result = await payrollRegister(prisma, user.id, month);
        break;
      }
      case "recurring-templates":
        result = await listRecurringTemplates(prisma, user.id);
        break;
      case "approval-queue":
        result = await financeApprovalQueue(prisma, user.id);
        break;
      case "document-vault":
        result = await financeDocumentVault(prisma, user.id);
        break;
      case "quick-entry-categories":
        result = await quickEntryCategories(prisma, user.id);
        break;
      case "category-ledger": {
        const categoryId = url.searchParams.get("categoryId");
        if (!categoryId) throw new FoundationError("CATEGORY_ID_REQUIRED", "categoryId is required", 400);
        const entryType = url.searchParams.get("entryType") ?? undefined;
        const employeeId = url.searchParams.get("employeeId") ?? undefined;
        const paymentMode = url.searchParams.get("paymentMode") ?? undefined;
        result = await categoryLedger(prisma, user.id, { categoryId, from: url.searchParams.get("from") ? from : undefined, to: url.searchParams.get("to") ? to : undefined, entryType, employeeId, paymentMode });
        break;
      }
      case "search-employees":
        result = await searchEmployees(prisma, user.id, url.searchParams.get("q") ?? "");
        break;
      case "employee-financial-360": {
        const employeeId = url.searchParams.get("employeeId");
        if (!employeeId) throw new FoundationError("EMPLOYEE_ID_REQUIRED", "employeeId is required", 400);
        result = await employeeFinancial360(prisma, user.id, employeeId);
        break;
      }
      case "documents-for": {
        const entityType = url.searchParams.get("entityType") as FinanceDocumentEntityType | null;
        const entityId = url.searchParams.get("entityId");
        if (!entityType || !entityId) throw new FoundationError("ENTITY_REQUIRED", "entityType and entityId are required", 400);
        result = await financeDocumentsFor(prisma, user.id, entityType, entityId);
        break;
      }
      default:
        throw new FoundationError("UNKNOWN_REPORT", "Unknown report requested", 400);
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
