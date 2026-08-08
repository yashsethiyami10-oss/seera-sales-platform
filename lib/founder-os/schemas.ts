import { z } from "zod";
import {
  ALERT_SEVERITIES, ALERT_TYPES, NOTIFICATION_CATEGORIES, NOTIFICATION_PRIORITIES, WIDGET_CATEGORIES,
  WORKSPACE_SURFACES, SORT_DIRECTIONS, DISPLAY_MODES, DISPLAY_DENSITIES, REPORT_TYPES, REPORT_GROUPINGS,
  COMPARISON_KEYS, REPORT_OUTPUT_PREFERENCES, SCHEDULE_FREQUENCIES, DELIVERY_CHANNELS, DATE_RANGE_PRESETS,
  WORKSPACE_LIMITS,
} from "./domain";
import { SUPPORTED_REPORT_METRICS } from "./explainability-service";

export const pageInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const alertCreateInput = z.object({
  alertType: z.enum(ALERT_TYPES),
  severity: z.enum(ALERT_SEVERITIES),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  sourceModule: z.string().trim().min(1).max(80),
  sourceEntityType: z.string().trim().max(80).optional(),
  sourceEntityId: z.string().trim().max(191).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const alertResolutionInput = z.object({
  reason: z.string().trim().max(2000).optional(),
});

export const notificationCreateInput = z.object({
  recipientId: z.string().cuid(),
  category: z.enum(NOTIFICATION_CATEGORIES),
  priority: z.enum(NOTIFICATION_PRIORITIES),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  deepLink: z.string().trim().max(300).optional(),
  sourceAlertId: z.string().cuid().optional(),
  sourceEntityType: z.string().trim().max(80).optional(),
  sourceEntityId: z.string().trim().max(191).optional(),
});

export const widgetDefinitionInput = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  category: z.enum(WIDGET_CATEGORIES),
  description: z.string().trim().max(500).optional(),
  requiredPermission: z.string().trim().max(80).optional(),
  defaultVisible: z.boolean().default(true),
  defaultOrder: z.coerce.number().int().min(0).default(0),
});

export const widgetPreferenceInput = z.object({
  widgetCode: z.string().trim().min(1).max(60),
  visible: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const searchInput = z.object({
  query: z.string().trim().min(1).max(191),
  types: z.array(z.enum(["CUSTOMER", "ORDER", "PRODUCT", "RECEIVABLE_INVOICE", "VENDOR_BILL", "SAVED_VIEW", "SAVED_REPORT", "DASHBOARD_LAYOUT"])).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ---------------------------------------------------------------------
// Part 3D, Stage 4 — Founder Workspace. Every schema below is `.strict()`
// (unknown keys are a validation error, not silently dropped) — the
// concrete mechanism behind "reject unsupported keys." `field`/`value`
// pairs are plain strings/numbers/booleans only — there is no schema
// branch anywhere that accepts a raw string blob interpreted as SQL,
// code, or an arbitrary JSON expression tree, so "no raw SQL," "no
// code," and "no arbitrary JSON execution" are true by construction, not
// by a runtime check that could be bypassed.
// ---------------------------------------------------------------------

const FILTER_OPERATORS = ["EQUALS", "NOT_EQUALS", "CONTAINS", "GREATER_THAN", "LESS_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL", "IN", "BETWEEN"] as const;

/** A single structured filter condition — a (field, operator, value)
 * triple, never a query fragment. `field` is checked here only for
 * shape; the saved-view/saved-report services separately re-validate
 * `field` against `SURFACE_FILTERABLE_FIELDS[surface]` (the actual
 * "supported fields only" enforcement, which needs the surface to know
 * which fields are legal — not expressible in a single static schema). */
const filterConditionInput = z.object({
  field: z.string().trim().min(1).max(60),
  operator: z.enum(FILTER_OPERATORS),
  value: z.union([
    z.string().trim().max(200),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string().trim().max(200), z.number()])).max(20),
  ]),
}).strict();

const filtersInput = z.array(filterConditionInput).max(WORKSPACE_LIMITS.maxFilterConditions);

export const savedViewCreateInput = z.object({
  surface: z.enum(WORKSPACE_SURFACES),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  filters: filtersInput.default([]),
  sortBy: z.string().trim().max(60).optional(),
  sortDirection: z.enum(SORT_DIRECTIONS).optional(),
  dateRangeFrom: z.coerce.date().optional(),
  dateRangeTo: z.coerce.date().optional(),
  displayMode: z.enum(DISPLAY_MODES).optional(),
  isDefault: z.boolean().default(false),
}).strict();

// `surface` is deliberately immutable on update — a Saved View's target
// surface is what makes its filters/sort meaningful; changing it would
// require re-validating every field against a different surface's
// allowlist, which is indistinguishable from creating a new view.
export const savedViewUpdateInput = savedViewCreateInput.omit({ surface: true }).partial().extend({ id: z.string().cuid() }).strict();

const dashboardLayoutWidgetInput = z.object({
  widgetCode: z.string().trim().min(1).max(60),
  order: z.coerce.number().int().min(0).max(1000),
  section: z.string().trim().max(60).optional(),
  width: z.coerce.number().int().min(1).max(12).optional(),
  height: z.coerce.number().int().min(1).max(12).optional(),
  visible: z.boolean().default(true),
}).strict();

export const dashboardLayoutCreateInput = z.object({
  name: z.string().trim().min(1).max(120),
  widgets: z.array(dashboardLayoutWidgetInput).max(WORKSPACE_LIMITS.maxWidgetsPerLayout).default([]),
  isActive: z.boolean().default(false),
  isDefault: z.boolean().default(false),
}).strict();

export const dashboardLayoutUpdateInput = dashboardLayoutCreateInput.partial().extend({ id: z.string().cuid() }).strict();

export const widgetPinInput = z.object({ widgetCode: z.string().trim().min(1).max(60) }).strict();

export const pinnedReorderInput = z.object({
  widgetCodes: z.array(z.string().trim().min(1).max(60)).min(1).max(WORKSPACE_LIMITS.maxPinnedWidgets),
}).strict();

export const savedReportCreateInput = z.object({
  name: z.string().trim().min(1).max(120),
  reportType: z.enum(REPORT_TYPES),
  metrics: z.array(z.enum(SUPPORTED_REPORT_METRICS)).max(WORKSPACE_LIMITS.maxMetricsPerReport).default([]),
  dateRangeFrom: z.coerce.date().optional(),
  dateRangeTo: z.coerce.date().optional(),
  comparisonMode: z.enum(COMPARISON_KEYS).optional(),
  grouping: z.enum(REPORT_GROUPINGS).optional(),
  filters: filtersInput.optional(),
  sortOrder: z.enum(SORT_DIRECTIONS).optional(),
  outputPreference: z.enum(REPORT_OUTPUT_PREFERENCES).optional(),
  scheduleFrequency: z.enum(SCHEDULE_FREQUENCIES).optional(),
  scheduleTimezone: z.string().trim().max(60).optional(),
  scheduleDeliveryChannel: z.enum(DELIVERY_CHANNELS).optional(),
  scheduleEnabled: z.boolean().default(false),
  scheduleRequestedTime: z.string().trim().max(20).optional(),
}).strict();

export const savedReportUpdateInput = savedReportCreateInput.partial().extend({ id: z.string().cuid() }).strict();

export const workspacePreferenceInput = z.object({
  defaultDashboardLayoutId: z.string().cuid().optional(),
  defaultLandingSurface: z.enum(WORKSPACE_SURFACES).optional(),
  defaultDateRange: z.enum(DATE_RANGE_PRESETS).optional(),
  defaultComparisonMode: z.enum(COMPARISON_KEYS).optional(),
  displayDensity: z.enum(DISPLAY_DENSITIES).optional(),
  tablePageSize: z.coerce.number().int().min(5).max(100).optional(),
  timezone: z.string().trim().max(60).optional(),
  notificationDisplayPreferences: z.record(z.string(), z.boolean()).optional(),
}).strict();

export const workspaceSearchInput = z.object({
  query: z.string().trim().min(1).max(191),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
