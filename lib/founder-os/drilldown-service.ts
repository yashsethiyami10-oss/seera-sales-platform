import { PERMISSIONS } from "@/lib/sales/constants";
import { NotFoundError } from "@/lib/errors";
import { requireFounderOsPrincipal } from "./context";
import { listReceivableInvoices } from "@/lib/enterprise-finance/ar-service";
import { listVendorBills } from "@/lib/enterprise-finance/ap-service";
import { getSourceLedger } from "@/lib/enterprise-finance/ledger-service";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 2 — Drill Down.
 * Enterprise → Business Area → Record → Transaction. Every level reuses
 * an existing, already-paginated, already-permission-checked list
 * function — `listReceivableInvoices`/`listVendorBills` (frozen Part 3C)
 * for the Record level, `getSourceLedger` (frozen Part 3C, repaired to be
 * bounded during the independent-audit repair pass) for the Transaction
 * level. Nothing here queries `FinanceLedgerEntry` directly a second way.
 */

export type BusinessArea = "FINANCE_RECEIVABLES" | "FINANCE_PAYABLES";

export async function listBusinessAreas() {
  // Stage 5 architecture review: this was the only top-level Founder OS
  // entry point with no principal check at all — every other read
  // requires `founder_os.access`, and a Server Action calls this one
  // directly (`fetchBusinessAreas`). The data itself is static, low-
  // sensitivity metadata, but leaving it unauthenticated was an
  // inconsistency, not a deliberate design choice — fixed for
  // consistency with every other entry point in this module.
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return [
    { key: "FINANCE_RECEIVABLES", label: "Accounts Receivable", recordType: "FinanceReceivableInvoice" },
    { key: "FINANCE_PAYABLES", label: "Accounts Payable", recordType: "FinanceVendorBill" },
  ] as const;
}

/** Business Area → Record: the list of records behind one area, reusing
 * each domain's own paginated Business Service list function. */
export async function drillDownToRecords(area: BusinessArea, input: unknown = {}) {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  switch (area) {
    case "FINANCE_RECEIVABLES":
      return listReceivableInvoices(input);
    case "FINANCE_PAYABLES":
      return listVendorBills(input);
    default: {
      const exhaustive: never = area;
      throw new NotFoundError(`Business area ${exhaustive}`);
    }
  }
}

/** Record → Transaction: the real posted ledger entries behind one
 * Finance record, reusing `getSourceLedger` (Part 3C) rather than a new
 * ledger query. */
export async function drillDownToTransactions(sourceType: "AR_INVOICE" | "AP_BILL", sourceId: string, input: unknown = {}) {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return getSourceLedger(sourceType, sourceId, input as { page?: number; pageSize?: number });
}
