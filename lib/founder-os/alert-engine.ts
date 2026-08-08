import { Prisma } from "@prisma/client";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { requireVersion, type EnterpriseTx } from "@/lib/enterprise/context";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { ALERT_THRESHOLDS } from "./domain";
import { alertResolutionInput } from "./schemas";
import { getReceivablesAging } from "@/lib/enterprise-finance/ar-service";
import { getPayablesAging } from "@/lib/enterprise-finance/ap-service";
import { createNotificationInTx } from "./notification-center";
import { upsertAlert } from "./alert-store";
import { listFailedJobs } from "./job-store";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Enterprise Alert
 * Engine. Detection reuses existing Finance reporting Business Services
 * (`getReceivablesAging`, `getPayablesAging`) for every receivable/payable
 * condition — it never recomputes an aging bucket or an overdue amount
 * itself. Two of the eight alert types this module's own domain vocabulary
 * names (`PERMISSION_VIOLATION`, `ORGANIZATION_INCONSISTENCY`) do not yet
 * have a purpose-built, complete detector in Stage 1 — see the honest
 * notes on `detectGovernanceExceptions` below for exactly what real signal
 * each one currently checks and what it deliberately does not claim to
 * cover yet.
 *
 * Idempotent by construction, not by an idempotency-key claim: each
 * detector checks for an existing ACTIVE alert with the same
 * (alertType, sourceEntityType, sourceEntityId) before creating a new one,
 * so re-running detection repeatedly never creates duplicate alerts for
 * the same still-unresolved condition.
 */


async function detectReceivablesExceptions(tx: EnterpriseTx, organizationKey: string) {
  const aging = await getReceivablesAging(new Date());
  const results = [];
  for (const row of aging.rows) {
    if (row.daysOverdue >= ALERT_THRESHOLDS.largeOverdueReceivableDays && row.outstandingAmount.greaterThanOrEqualTo(ALERT_THRESHOLDS.largeOverdueReceivableAmount)) {
      results.push(await upsertAlert(tx, organizationKey, {
        alertType: "LARGE_OVERDUE_RECEIVABLE", severity: row.daysOverdue >= 60 ? "CRITICAL" : "WARNING",
        title: `Invoice ${row.invoiceNumber} is ${row.daysOverdue} days overdue`,
        description: `${row.outstandingAmount.toFixed(2)} outstanding on invoice ${row.invoiceNumber}, ${row.daysOverdue} days past due.`,
        sourceModule: "FINANCE", sourceEntityType: "FinanceReceivableInvoice", sourceEntityId: row.invoiceId,
        metadata: { outstandingAmount: row.outstandingAmount.toString(), daysOverdue: row.daysOverdue },
      }));
    }
  }
  const totalOutstanding = Object.values(aging.buckets).reduce((sum, v) => sum.plus(v), new Prisma.Decimal(0));
  if (totalOutstanding.greaterThanOrEqualTo(ALERT_THRESHOLDS.highReceivablesBalanceTotal)) {
    results.push(await upsertAlert(tx, organizationKey, {
      alertType: "HIGH_RECEIVABLES_BALANCE", severity: "WARNING",
      title: "Total outstanding receivables are high",
      description: `Total outstanding receivables across all customers: ${totalOutstanding.toFixed(2)}.`,
      sourceModule: "FINANCE", metadata: { totalOutstanding: totalOutstanding.toString() },
    }));
  }
  return results;
}

async function detectPayablesExceptions(tx: EnterpriseTx, organizationKey: string) {
  const aging = await getPayablesAging(new Date());
  const results = [];
  for (const row of aging.rows) {
    if (row.daysOverdue >= ALERT_THRESHOLDS.largeOverduePayableDays && row.outstandingAmount.greaterThanOrEqualTo(ALERT_THRESHOLDS.largeOverduePayableAmount)) {
      results.push(await upsertAlert(tx, organizationKey, {
        alertType: "LARGE_OVERDUE_PAYABLE", severity: row.daysOverdue >= 60 ? "CRITICAL" : "WARNING",
        title: `Bill ${row.billNumber} is ${row.daysOverdue} days overdue`,
        description: `${row.outstandingAmount.toFixed(2)} outstanding on bill ${row.billNumber}, ${row.daysOverdue} days past due.`,
        sourceModule: "FINANCE", sourceEntityType: "FinanceVendorBill", sourceEntityId: row.billId,
        metadata: { outstandingAmount: row.outstandingAmount.toString(), daysOverdue: row.daysOverdue },
      }));
    }
  }
  return results;
}

/** No existing Business Service exposes "list pending vendor payments" —
 * this is a new, read-only, directly-scoped query (never a write), one per
 * payment awaiting the second-actor approval `approveVendorPayment`
 * (Part 3C, frozen) requires. */
async function detectPendingVendorPayments(tx: EnterpriseTx, organizationKey: string) {
  const pending = await tx.financeVendorPayment.findMany({ where: { organizationKey, status: "REQUESTED" }, take: 500 });
  const results = [];
  for (const payment of pending) {
    results.push(await upsertAlert(tx, organizationKey, {
      alertType: "VENDOR_PAYMENT_PENDING_APPROVAL", severity: "INFO",
      title: `Vendor payment ${payment.paymentNumber} awaiting approval`,
      description: `Payment ${payment.paymentNumber} for ${payment.amount.toFixed(2)} was requested and is awaiting a second-actor approval.`,
      sourceModule: "FINANCE", sourceEntityType: "FinanceVendorPayment", sourceEntityId: payment.id,
      metadata: { amount: payment.amount.toString() },
    }));
  }
  return results;
}

/** Reuses the same `JOB:` operationType prefix convention Part 3C's own
 * background jobs and `findStalePhase2Jobs` already use (`lib/enterprise-
 * phase2/jobs.ts`) — a real, direct, read-only query, since no "list
 * failed jobs" function exists yet to call instead. */
async function detectFailedBackgroundJobs(tx: EnterpriseTx, organizationKey: string) {
  const failed = await listFailedJobs(tx, organizationKey);
  const results = [];
  for (const job of failed) {
    results.push(await upsertAlert(tx, organizationKey, {
      alertType: "BACKGROUND_JOB_FAILED", severity: "WARNING",
      title: `Background job failed: ${job.operationType.replace("JOB:", "")}`,
      description: `Job ${job.operationType} (idempotency key ${job.idempotencyKey}) failed: ${job.failureCode ?? "no failure code recorded"}.`,
      sourceModule: "SYSTEM", sourceEntityType: "Phase2Operation", sourceEntityId: job.id,
      metadata: { failureCode: job.failureCode },
    }));
  }
  return results;
}

/**
 * Honest scope note: `PERMISSION_VIOLATION` and `ORGANIZATION_INCONSISTENCY`
 * are named in this module's own domain vocabulary because Stage 1's
 * objective explicitly asks for them, but neither has a complete detector
 * yet — the real data each would need doesn't fully exist:
 *  - No existing log records authorization *denials* (only successful
 *    `SOD_OVERRIDE` events are audited, by `enforceSegregationOfDuties`
 *    itself in the frozen Part 3A foundation). A same-actor SoD override
 *    is the closest real, currently-available governance signal, so that
 *    is what this surfaces under `PERMISSION_VIOLATION` — it is not a
 *    general permission-denial detector, and is documented as such rather
 *    than silently pretending to be one.
 *  - `ORGANIZATION_INCONSISTENCY` here checks one real, narrow condition:
 *    a fiscal period reopened into `ADJUSTMENT` status that has stayed
 *    open longer than a normal adjustment window — a genuine governance
 *    signal (frozen Part 3C's own fiscal-period lifecycle), not a general
 *    cross-organization-leakage or data-integrity scanner.
 * A future stage should either build the missing detectors for real or
 * rename these types to describe what they actually check.
 */
async function detectGovernanceExceptions(tx: EnterpriseTx, organizationKey: string) {
  const results = [];
  const staleOverrideCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // recordEnterpriseMutation (frozen Part 3A foundation) writes the same
  // SOD_OVERRIDE event to both SalesAuditLog (no human-readable
  // description column) and SalesTimelineEvent (which does) — reading the
  // latter here for the real description text.
  const overrides = await tx.salesTimelineEvent.findMany({
    where: { eventType: "SOD_OVERRIDE", createdAt: { gte: staleOverrideCutoff } },
    take: 50, orderBy: { createdAt: "desc" },
  });
  for (const override of overrides) {
    results.push(await upsertAlert(tx, organizationKey, {
      alertType: "PERMISSION_VIOLATION", severity: "WARNING",
      title: "Segregation-of-duties override recorded",
      description: override.description || "A same-actor SoD override was recorded and independently approved.",
      sourceModule: "GOVERNANCE", sourceEntityType: override.relatedRecordType, sourceEntityId: override.relatedRecordId,
    }));
  }

  const staleAdjustmentCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const reopenedPeriods = await tx.financeFiscalPeriod.findMany({
    where: { organizationKey, status: "ADJUSTMENT", updatedAt: { lte: staleAdjustmentCutoff } },
    take: 50,
  });
  for (const period of reopenedPeriods) {
    results.push(await upsertAlert(tx, organizationKey, {
      alertType: "ORGANIZATION_INCONSISTENCY", severity: "WARNING",
      title: `Fiscal period "${period.name}" has been reopened for over 14 days`,
      description: `Fiscal period "${period.name}" was reopened into ADJUSTMENT status and has not been hard-closed again.`,
      sourceModule: "FINANCE", sourceEntityType: "FinanceFiscalPeriod", sourceEntityId: period.id,
    }));
  }
  return results;
}

type DetectorResult = { created: boolean; alert: { id: string; severity: string; title: string; description: string; sourceEntityType: string | null; sourceEntityId: string | null } };

/** Each detector reads from an independently-gated subsystem (Finance
 * reporting behind its own feature flag, for the receivable/payable
 * detectors specifically) — one disabled flag should not abort every
 * other detector, matching the same graceful-degradation discipline
 * `kpi-engine.ts`'s own `safe()` wrapper already establishes for the
 * dashboard's read side. Returns `[]` and records the failure reason on
 * failure rather than throwing. */
async function safeDetect(name: string, fn: () => Promise<DetectorResult[]>): Promise<{ name: string; results: DetectorResult[]; error?: string }> {
  try {
    return { name, results: await fn() };
  } catch (error) {
    return { name, results: [], error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/** Runs every detector, deduplicating against still-ACTIVE alerts (see
 * `upsertAlert`), and creates one Notification Center entry per genuinely
 * new alert. Stage 1 simplification, disclosed: notifies the calling
 * principal only, not every Founder — Stage 1 has no scheduler/cron (the
 * Founder OS objective explicitly scopes background execution out, same
 * as Part 3C's own two background jobs), so this always runs as an
 * on-demand call by a real logged-in Founder; a future stage that adds a
 * scheduled trigger should fan this out to every active Founder account. */
export async function runAlertDetection() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ALERTS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const sections = await Promise.all([
      safeDetect("receivables", () => detectReceivablesExceptions(tx, principal.organizationKey)),
      safeDetect("payables", () => detectPayablesExceptions(tx, principal.organizationKey)),
      safeDetect("vendorPayments", () => detectPendingVendorPayments(tx, principal.organizationKey)),
      safeDetect("backgroundJobs", () => detectFailedBackgroundJobs(tx, principal.organizationKey)),
      safeDetect("governance", () => detectGovernanceExceptions(tx, principal.organizationKey)),
    ]);
    const all = sections.flatMap((section) => section.results);
    const newlyCreated = all.filter((r) => r.created);
    for (const result of newlyCreated) {
      await createNotificationInTx(tx, principal.organizationKey, {
        recipientId: principal.id,
        category: "ALERT",
        priority: result.alert.severity === "CRITICAL" ? "CRITICAL" : result.alert.severity === "WARNING" ? "HIGH" : "NORMAL",
        title: result.alert.title,
        body: result.alert.description,
        sourceAlertId: result.alert.id,
        sourceEntityType: result.alert.sourceEntityType ?? undefined,
        sourceEntityId: result.alert.sourceEntityId ?? undefined,
      });
    }
    const failures = sections.filter((s) => s.error).map((s) => ({ section: s.name, error: s.error! }));
    return { checked: all.length, created: newlyCreated.length, failures };
  });
}

export async function listAlerts(filters: { status?: string; severity?: string } = {}) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return enterpriseTransaction((tx) => tx.founderAlert.findMany({
    where: { organizationKey: principal.organizationKey, status: filters.status, severity: filters.severity },
    orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
    take: 200,
  }));
}

async function loadAlert(tx: EnterpriseTx, organizationKey: string, alertId: string) {
  const alert = await tx.founderAlert.findFirst({ where: { id: alertId, organizationKey } });
  if (!alert) throw new NotFoundError("Alert");
  return alert;
}

export async function acknowledgeAlert(alertId: string, expectedVersion: number) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ALERTS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const alert = await loadAlert(tx, principal.organizationKey, alertId);
    requireVersion(alert.version, expectedVersion);
    if (alert.status !== "ACTIVE") throw new ConflictError("Only an active alert may be acknowledged");
    return tx.founderAlert.update({
      where: { id: alert.id },
      data: { status: "ACKNOWLEDGED", acknowledgedById: principal.id, acknowledgedAt: new Date(), version: { increment: 1 } },
    });
  });
}

export async function resolveAlert(alertId: string, expectedVersion: number, input: unknown) {
  const data = alertResolutionInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ALERTS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const alert = await loadAlert(tx, principal.organizationKey, alertId);
    requireVersion(alert.version, expectedVersion);
    if (alert.status === "RESOLVED") throw new ConflictError("This alert is already resolved");
    return tx.founderAlert.update({
      where: { id: alert.id },
      data: {
        status: "RESOLVED", resolvedById: principal.id, resolvedAt: new Date(), version: { increment: 1 },
        metadata: data.reason
          ? ({ ...(alert.metadata as Record<string, unknown> | null), resolutionReason: data.reason } as Prisma.InputJsonValue)
          : (alert.metadata as Prisma.InputJsonValue | undefined),
      },
    });
  });
}

