/**
 * Part 3D Stage 1 — shared domain vocabulary. Plain string unions (not
 * Prisma enums), matching every Finance domain type's own convention
 * (`FinanceJournalType` etc. in `lib/enterprise-finance/domain.ts`) —
 * validated at the Zod boundary, not the database, since none of these
 * values participate in a structural database invariant the way a
 * debit/credit sign does.
 */

export const ALERT_TYPES = [
  "LARGE_OVERDUE_RECEIVABLE",
  "HIGH_RECEIVABLES_BALANCE",
  "LARGE_OVERDUE_PAYABLE",
  "VENDOR_PAYMENT_PENDING_APPROVAL",
  "BACKGROUND_JOB_FAILED",
  "PERMISSION_VIOLATION",
  "ORGANIZATION_INCONSISTENCY",
  "FINANCE_EXCEPTION",
  // Stage 2 — Risk Engine (rule-based, no prediction). See risk-engine.ts
  // for exactly what real comparison each one is derived from.
  "REVENUE_DROP",
  "EXPENSE_SPIKE",
  "COLLECTION_DELAY",
  "CUSTOMER_DECLINE",
  "BUSINESS_ANOMALY",
  // Milestone 9 — Customer Support. Additive extension only (governed change
  // control, same precedent as Milestone 8's FINANCE_JOURNAL_TYPES
  // extension in lib/enterprise-finance/domain.ts) — nothing above removed
  // or renamed. Emitted via lib/founder-os/alert-store.ts's upsertAlert,
  // never a new alert table.
  "SUPPORT_SLA_BREACH",
  "SUPPORT_CRITICAL_TICKET",
  "SUPPORT_CSAT_DROP",
  "SUPPORT_ESCALATION_UNRESOLVED",
] as const;
export type FounderAlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type FounderAlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ["ACTIVE", "ACKNOWLEDGED", "RESOLVED"] as const;
export type FounderAlertStatus = (typeof ALERT_STATUSES)[number];

export const NOTIFICATION_CATEGORIES = ["ALERT", "APPROVAL", "FINANCE", "SALES", "SYSTEM"] as const;
export type FounderNotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export type FounderNotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const WIDGET_CATEGORIES = ["KPI", "ALERTS", "NOTIFICATIONS", "TIMELINE", "HEALTH", "CUSTOM"] as const;
export type FounderWidgetCategory = (typeof WIDGET_CATEGORIES)[number];

/** Detection thresholds — plain, documented business rules (not a trained
 * model or configurable policy engine yet), matching how `lib/analytics.ts`
 * itself documents its own RFM segment thresholds as "plain business
 * rules." Stage 1 scope: fixed constants; a future stage may make these
 * configurable per organization. */
export const ALERT_THRESHOLDS = {
  /** A single receivable this overdue-and-large triggers LARGE_OVERDUE_RECEIVABLE. */
  largeOverdueReceivableAmount: 50000,
  largeOverdueReceivableDays: 30,
  /** A single payable this overdue-and-large triggers LARGE_OVERDUE_PAYABLE. */
  largeOverduePayableAmount: 50000,
  largeOverduePayableDays: 30,
  /** Total outstanding receivables across all customers, above which the
   * organization-wide HIGH_RECEIVABLES_BALANCE alert fires (at most once
   * while still ACTIVE — see alert-engine.ts's dedupe logic). */
  highReceivablesBalanceTotal: 500000,

  // Stage 2 — Risk Engine thresholds. Every one of these compares two
  // real numbers the Comparison Engine already computed (period vs. prior
  // period) against a fixed percentage — rule-based, not a forecast.
  /** Revenue down this much or more (this-period vs. prior-period, via the
   * Comparison Engine's WEEK_VS_WEEK) triggers REVENUE_DROP. */
  revenueDropPercent: 20,
  /** Approved expense total up this much or more (month vs. month) triggers EXPENSE_SPIKE. */
  expenseSpikePercent: 30,
  /** Average receivables age (days) above this triggers COLLECTION_DELAY. */
  collectionDelayAverageDays: 45,
  /** New-customer count down this much or more (month vs. month) triggers CUSTOMER_DECLINE. */
  customerDeclinePercent: 30,
} as const;

// ---------------------------------------------------------------------
// Part 3D, Stage 4 — Founder Workspace vocabulary. Same "plain, fixed,
// documented string union" convention as everything above — every one of
// these is a closed registry Zod validates every write against, not a
// free-text field.
// ---------------------------------------------------------------------

/** The only surfaces a Saved View may target — every one a real, already
 * built Stage 1-3 read surface. Adding a new surface here later requires
 * a corresponding real surface to exist; this list is never allowed to
 * get ahead of what's actually built. */
export const WORKSPACE_SURFACES = [
  "ALERTS", "DECISION_QUEUE", "APPROVAL_CENTER", "EXCEPTION_CENTER",
  "ENTERPRISE_MONITORING", "TIMELINE", "ACTIVITY_FEED", "SEARCH", "EXECUTIVE_REPORTS",
] as const;
export type WorkspaceSurface = (typeof WORKSPACE_SURFACES)[number];

export const SORT_DIRECTIONS = ["ASC", "DESC"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const DISPLAY_MODES = ["LIST", "TABLE", "GRID", "COMPACT"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export const DISPLAY_DENSITIES = ["COMFORTABLE", "COMPACT"] as const;
export type DisplayDensity = (typeof DISPLAY_DENSITIES)[number];

/** Every report type is a direct dispatch to one already-existing Stage
 * 1/2 composition — report-workspace-service.ts's generateReport() never
 * branches into a calculation this list doesn't name. */
export const REPORT_TYPES = [
  "EXECUTIVE_SUMMARY", "KPI_SNAPSHOT", "TREND_ANALYSIS", "PERIOD_COMPARISON", "DECISION_QUEUE_SNAPSHOT",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Reused verbatim as the Trend Engine's own granularities (minus CUSTOM,
 * which the report's explicit dateRangeFrom/dateRangeTo already covers). */
export const REPORT_GROUPINGS = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type ReportGrouping = (typeof REPORT_GROUPINGS)[number];

export const COMPARISON_KEYS = ["TODAY_VS_YESTERDAY", "WEEK_VS_WEEK", "MONTH_VS_MONTH", "QUARTER_VS_QUARTER", "YEAR_VS_YEAR"] as const;

/** The exact preset vocabulary `lib/analytics.ts`'s own `resolveDateRange(preset)`
 * accepts (frozen Phase 15) — reused verbatim as the allowed value for a
 * workspace's `defaultDateRange` preference, not a second date-range vocabulary. */
export const DATE_RANGE_PRESETS = ["today", "7d", "30d", "90d", "ytd", "all"] as const;

/** Per-surface allowlist a Saved View's/Saved Filter's `field` must
 * belong to — the concrete mechanism behind "supported fields only."
 * Deliberately conservative: only fields the real surface's own service
 * actually filters/sorts by in this Stage; extending a surface's
 * filterable fields later requires updating both this list and the
 * surface's own service. */
export const SURFACE_FILTERABLE_FIELDS: Record<WorkspaceSurface, readonly string[]> = {
  ALERTS: ["severity", "status", "alertType", "sourceModule"],
  DECISION_QUEUE: ["pendingApprovalsCount"],
  APPROVAL_CENTER: ["status"],
  EXCEPTION_CENTER: ["sourceModule", "severity"],
  ENTERPRISE_MONITORING: ["status"],
  TIMELINE: ["eventType"],
  ACTIVITY_FEED: ["eventType"],
  SEARCH: ["type"],
  EXECUTIVE_REPORTS: ["reportType"],
};

/** No file-export subsystem exists anywhere in this codebase (confirmed
 * by search before this Stage was built) — both values describe how the
 * generateReport() JSON payload is intended to be rendered by the
 * caller, never a generated file. */
export const REPORT_OUTPUT_PREFERENCES = ["DASHBOARD_VIEW", "JSON"] as const;
export type ReportOutputPreference = (typeof REPORT_OUTPUT_PREFERENCES)[number];

export const SCHEDULE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

/** Reuses the exact same channel vocabulary as the Prisma `NotificationChannel`
 * enum (`DASHBOARD`/`EMAIL`/`SMS`/`WHATSAPP`) rather than inventing a
 * second one — stored as a plain string here (not the enum type) since
 * this column only ever describes a Founder's stated preference, never
 * drives an actual send (no scheduler exists to act on it — see
 * PART_3D_FOUNDER_OS_STAGE4.md's "Scheduling limitation" section). */
export const DELIVERY_CHANNELS = ["DASHBOARD", "EMAIL", "SMS", "WHATSAPP"] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

/** Fixed operational limits — bounding filter/result sizes the same way
 * `pageInput`'s `pageSize.max(100)` already bounds every Stage 1-3 list,
 * and `ALERT_THRESHOLDS` bounds detection — not configurable per
 * organization yet. */
export const WORKSPACE_LIMITS = {
  maxPinnedWidgets: 8,
  maxSavedViewsPerOwner: 100,
  maxDashboardLayoutsPerOwner: 20,
  maxWidgetsPerLayout: 50,
  maxSavedReportsPerOwner: 100,
  maxMetricsPerReport: 20,
  maxFilterConditions: 20,
  maxReportDateRangeDays: 400,
} as const;
