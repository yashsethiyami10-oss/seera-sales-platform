import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { requireFounderOsPrincipal } from "./context";
import { pageInput } from "./schemas";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Executive
 * Timeline and Enterprise Activity Feed. Neither introduces a new table —
 * both are query layers over the existing `SalesTimelineEvent` model,
 * which every enterprise mutation across Parts 3A (Network Partner), 3B,
 * and 3C (Finance) already writes to via `recordEnterpriseMutation`
 * (`lib/enterprise/governance.ts`, frozen shared foundation). Nothing here
 * writes to that table — Founder OS only ever reads it.
 *
 * `organizationKey` is not a native column on `SalesTimelineEvent` — every
 * `recordEnterpriseMutation` call already stamps it into `metadata.
 * organizationKey`, so both queries below filter on that JSON path rather
 * than a column, and take a fixed, single-organization system
 * (`ENTERPRISE_ORGANIZATION = "MUV"`) as read elsewhere in this
 * codebase's own Enterprise context — there is only ever one
 * organizationKey value in this deployment today.
 */

const ENTERPRISE_ORGANIZATION = "MUV";

/** Event types curated as "founder-significant" — a deliberately narrow,
 * documented allowlist (not every event type this codebase's Enterprise
 * modules can emit), matching the Stage 1 objective's own examples:
 * customer creation, large orders, invoice posting, vendor payment
 * approval, expense reimbursement, fiscal period closure, permission
 * changes. The Activity Feed below is the uncurated version of the same
 * underlying data for anyone who wants everything. */
const EXECUTIVE_TIMELINE_EVENT_TYPES = [
  "AR_INVOICE_ISSUED", "AR_RECEIPT_RECORDED", "AP_BILL_POSTED", "AP_PAYMENT_APPROVED",
  "EXPENSE_CLAIM_REIMBURSED", "JOURNAL_POSTED", "JOURNAL_REVERSED",
  "FISCAL_PERIOD_CLOSED", "FISCAL_PERIOD_REOPENED", "SOD_OVERRIDE",
  "RECONCILIATION_COMPLETED", "PARTNER_ONBOARDING_STATUS_CHANGED",
];

export async function getExecutiveTimeline(input: unknown = {}) {
  const params = pageInput.parse(input);
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return enterpriseTransaction(async (tx) => {
    const where = {
      eventType: { in: EXECUTIVE_TIMELINE_EVENT_TYPES },
      metadata: { path: ["organizationKey"], equals: ENTERPRISE_ORGANIZATION },
    };
    const [total, items] = await Promise.all([
      tx.salesTimelineEvent.count({ where }),
      tx.salesTimelineEvent.findMany({
        where, orderBy: [{ createdAt: "desc" }], skip: (params.page - 1) * params.pageSize, take: params.pageSize,
      }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  });
}

export async function getActivityFeed(input: unknown = {}) {
  const params = pageInput.parse(input);
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return enterpriseTransaction(async (tx) => {
    const where = { metadata: { path: ["organizationKey"], equals: ENTERPRISE_ORGANIZATION } };
    const [total, items] = await Promise.all([
      tx.salesTimelineEvent.count({ where }),
      tx.salesTimelineEvent.findMany({
        where, orderBy: [{ createdAt: "desc" }], skip: (params.page - 1) * params.pageSize, take: params.pageSize,
      }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  });
}
