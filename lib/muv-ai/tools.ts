import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError } from "@/lib/errors";
import { requireStaff } from "@/lib/rbac";
import { listCustomerIntelligence } from "@/lib/growth/repository";
import { listSupportTickets, createSupportTicket } from "@/lib/support/ticket-service";
import { listOpportunities } from "@/actions/inst-opportunities";
import { createFollowUp } from "@/actions/inst-followups";
import { createQuotation } from "@/actions/inst-quotations";
import {
  getPipelineReport, getConversionReport, getOpportunityReport, getTerritoryReport,
  getOfficerPerformanceReport, getSampleConversionReport, getLostReasonsReport, getRevenueTrendsReport,
} from "@/actions/inst-reports";
import { getLatestSalesIntelligence, listSalesIntelligenceHistory } from "@/lib/sales/sales-intelligence-service";
import { getFounderDashboard } from "@/lib/founder-os/dashboard-service";
import { getDecisionQueue } from "@/lib/founder-os/decision-queue-service";
import { getSystemHealth } from "@/lib/production/health-monitor";
import { getVersionRegistry } from "@/lib/production/version-registry";
import type { AiPrincipal, EvidenceReference } from "./types";

/** actions/inst-*.ts Server Actions catch their own errors and return
 * `{success:false,error}` rather than throwing (this codebase's universal
 * action convention, per CLAUDE.md's toErrorResponse() shape) — unlike
 * lib/support/ticket-service.ts's functions (called directly, not via
 * their action wrapper), which throw. A tool adapter has no "failure"
 * variant of its own (invokeTool's race/return path expects either a real
 * ToolResult or a thrown error), so an unsuccessful action result is
 * converted into a thrown error here — never silently returned as if it
 * were data. */
function unwrap<T>(result: { success: boolean; data?: T; error?: { message: string; code?: string } }): T {
  if (!result.success) throw new AppError(result.error?.message ?? "Action failed", 422, result.error?.code);
  return result.data as T;
}

type ActionResult<T> = { success: boolean; data?: T; error?: { message: string; code?: string } };
const REPORT_DISPATCH: Record<string, () => Promise<ActionResult<unknown>>> = {
  PIPELINE: () => getPipelineReport(),
  CONVERSION: () => getConversionReport(),
  OPPORTUNITY: () => getOpportunityReport(),
  TERRITORY: () => getTerritoryReport(),
  OFFICER_PERFORMANCE: () => getOfficerPerformanceReport(),
  SAMPLE_CONVERSION: () => getSampleConversionReport(),
  LOST_REASONS: () => getLostReasonsReport(),
  REVENUE_TRENDS: () => getRevenueTrendsReport(),
};

type ToolResult = { data: unknown; references: EvidenceReference[]; confidence: "VERY_HIGH"|"HIGH"|"MEDIUM"|"LOW"; warnings: string[] };
const adapters: Record<string, (principal: AiPrincipal, input: Record<string, unknown>) => Promise<ToolResult>> = {
  CUSTOMER_LOOKUP: async (principal, input) => {
    const scope = principal.isFounder || principal.permissions.has("customers.view_all") ? {} : { ownerUserId: principal.id, territoryId: principal.territoryId ?? undefined, institutionalOnly: principal.roleName === "Institutional Sales Officer" };
    const result = await listCustomerIntelligence({ search: String(input.query ?? ""), take: 10 }, scope);
    return { data: result.rows.map(row => ({ id: row.customer.id, name: row.customer.businessName ?? row.customer.name, status: row.profile.statusCode })), references: result.rows.map(row => ({ type: "CUSTOMER", id: row.customer.id, timestamp: row.profile.lastCalculatedAt.toISOString(), source: "Customer Intelligence Service" })), confidence: "VERY_HIGH", warnings: [] };
  },
  CUSTOMER_INTELLIGENCE: async (principal, input) => adapters.CUSTOMER_LOOKUP!(principal, input),
  KNOWLEDGE_SEARCH: async (principal, input) => {
    const query = String(input.query ?? "").replace(/^(find|search|show|lookup)\s+/i, "").trim();
    const rows = await prisma.aiKnowledgeRecord.findMany({ where: { organizationKey: principal.organizationKey, status: "PUBLISHED", OR: [{ title: { contains: query, mode: "insensitive" } }, { tags: { has: query } }] }, orderBy: { updatedAt: "desc" }, take: 10 });
    return { data: rows.map(r => ({ id: r.id, title: r.title, category: r.category, content: r.content })), references: rows.map(r => ({ type: "KNOWLEDGE", id: r.id, version: String(r.version), timestamp: r.updatedAt.toISOString(), source: r.sourceType })), confidence: rows.length ? "HIGH" : "LOW", warnings: [] };
  },
  // MUV AI Engineering Execution — Sprint 12 (Support AI). Both adapters are
  // thin pass-throughs to lib/support/ticket-service.ts's real, already-
  // authorizing functions (requireSupportPrincipal inside each) — reused,
  // not reimplemented. This is the first real bridge between the AI layer
  // and the Support domain anywhere in the codebase (confirmed by research
  // before this sprint: zero prior integration existed).
  SUPPORT_TICKET_LOOKUP: async (_principal, input) => {
    const result = await listSupportTickets({ customerId: input.customerId ? String(input.customerId) : undefined, q: input.query ? String(input.query) : undefined, pageSize: 10 });
    return {
      data: result.items.map((t) => ({ id: t.id, ticketNumber: t.ticketNumber, status: t.status, priority: t.priority, subject: t.subject })),
      references: result.items.map((t) => ({ type: "SUPPORT_TICKET", id: t.id, timestamp: t.createdAt.toISOString(), source: "Support Ticket Service" })),
      confidence: result.items.length ? "HIGH" : "LOW",
      warnings: [],
    };
  },
  // A write tool, deliberately NOT routed through lib/muv-ai/workflow.ts's
  // AiActionRequest approval framework — that framework currently has no
  // execution engine for ANY action type (decideAction only ever updates
  // the request's own status, confirmed by reading it before this sprint;
  // a pre-existing gap, not something this sprint silently half-fixes).
  // createSupportTicket() is a single, bounded, staff-initiated, fully
  // audited (SalesAuditLog + AiTelemetry via invokeTool itself, plus
  // Support's own recordEnterpriseMutation) write — proportionate to
  // invokeTool's existing authorization model, unlike a HIGH-risk action
  // (payments, deletions) that framework was actually designed for.
  CREATE_SUPPORT_TICKET: async (_principal, input) => {
    const ticket = await createSupportTicket(input);
    return {
      data: { id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status, priority: ticket.priority },
      references: [{ type: "SUPPORT_TICKET", id: ticket.id, timestamp: ticket.createdAt.toISOString(), source: "Support Ticket Service" }],
      confidence: "VERY_HIGH",
      warnings: [],
    };
  },
  // MUV AI Engineering Execution — Sprint 13 (Sales AI). Every adapter here
  // is a thin pass-through to the real, already-authorizing
  // actions/inst-*.ts Server Actions or lib/sales/sales-intelligence-service.ts
  // (Sprint 11) — reused, not reimplemented, same discipline as Sprint 12's
  // Support adapters. See prisma/seed.ts's tools array for a fixed,
  // previously-latent bug this sprint also corrects: several of these tool
  // codes were seeded with a legacy/wrong-namespace requiredPermission
  // string that would have made them unreachable for real Institutional
  // Sales users even once an adapter existed.
  OPPORTUNITY_LOOKUP: async (_principal, input) => {
    const result = unwrap(await listOpportunities({ q: input.query ? String(input.query) : undefined, pageSize: 10 }));
    const items = (result as { items: { id: string; opportunityNumber: string; stage: string; estimatedRevenue: number; updatedAt: string | Date }[] }).items;
    return {
      data: items.map((o) => ({ id: o.id, opportunityNumber: o.opportunityNumber, stage: o.stage, estimatedRevenue: o.estimatedRevenue })),
      references: items.map((o) => ({ type: "INST_OPPORTUNITY", id: o.id, timestamp: new Date(o.updatedAt).toISOString(), source: "Institutional Sales OS" })),
      confidence: items.length ? "HIGH" : "LOW",
      warnings: [],
    };
  },
  // Read-only by design: wraps getLatestSalesIntelligence/
  // listSalesIntelligenceHistory (both read-only), never
  // computeSalesIntelligence (which writes a new snapshot) — an AI lookup
  // tool observes, it does not trigger a recompute as a side effect.
  SALES_INTELLIGENCE_LOOKUP: async (_principal, input) => {
    const opportunityId = String(input.opportunityId ?? "");
    if (!opportunityId) return { data: null, references: [], confidence: "LOW", warnings: ["opportunityId is required"] };
    const latest = await getLatestSalesIntelligence(opportunityId);
    if (!latest) return { data: null, references: [], confidence: "LOW", warnings: ["No Sales Intelligence snapshot exists yet for this opportunity"] };
    return {
      data: { dealHealthScore: latest.dealHealthScore, dealHealthLevel: latest.dealHealthLevel, stage: latest.stage, evidence: latest.evidence },
      references: [{ type: "SALES_INTELLIGENCE_SNAPSHOT", id: latest.id, timestamp: latest.generatedAt.toISOString(), source: "Sales Intelligence Foundation" }],
      confidence: "HIGH",
      warnings: [],
    };
  },
  CREATE_FOLLOWUP: async (_principal, input) => {
    const followUp = unwrap(await createFollowUp(input));
    const f = followUp as { id: string; type: string; dueDate: string | Date; createdAt: string | Date };
    return {
      data: { id: f.id, type: f.type, dueDate: f.dueDate },
      references: [{ type: "INST_FOLLOWUP", id: f.id, timestamp: new Date(f.createdAt).toISOString(), source: "Institutional Sales OS" }],
      confidence: "VERY_HIGH",
      warnings: [],
    };
  },
  CREATE_DRAFT_QUOTATION: async (_principal, input) => {
    const created = unwrap(await createQuotation(input));
    const q = created as { quotationId: string; versionId: string; quotationNumber: string };
    return {
      data: { quotationId: q.quotationId, quotationNumber: q.quotationNumber, status: "DRAFT" },
      references: [{ type: "INST_QUOTATION", id: q.quotationId, version: q.versionId, timestamp: new Date().toISOString(), source: "Institutional Sales OS" }],
      confidence: "VERY_HIGH",
      warnings: [],
    };
  },
  // REPORT_LOOKUP/EXECUTIVE_REPORT dispatch over the same 8 real,
  // already-built Module 14 report functions via an explicit reportType
  // discriminator — never a fabricated report. Two tool codes, one
  // dispatch table: EXECUTIVE_REPORT is not a functionally distinct report
  // tier (no such tier exists in actions/inst-reports.ts), just the
  // pre-existing seeded tool name a Founder-routed request already uses.
  REPORT_LOOKUP: async (_principal, input) => {
    const reportType = String(input.reportType ?? "PIPELINE").toUpperCase();
    const dispatch = REPORT_DISPATCH[reportType];
    if (!dispatch) return { data: null, references: [], confidence: "LOW", warnings: [`Unknown reportType "${reportType}" — valid: ${Object.keys(REPORT_DISPATCH).join(", ")}`] };
    const data = unwrap(await dispatch());
    return { data, references: [{ type: "INST_REPORT", id: reportType, timestamp: new Date().toISOString(), source: "Institutional Sales OS Reports" }], confidence: "HIGH", warnings: [] };
  },
  EXECUTIVE_REPORT: async (principal, input) => adapters.REPORT_LOOKUP!(principal, input),
  // MUV AI Engineering Execution — Sprint 14 (Founder AI). Both adapters
  // call the real, already-built lib/founder-os/* services directly (each
  // self-authorizes via requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS)
  // internally) — the exact same "thin pass-through, reuse the real
  // authorizing function" pattern as Sprints 12-13. Research before this
  // sprint confirmed FOUNDER_INTELLIGENCE had zero tools touching
  // lib/founder-os/* despite it being a complete, tested, already-built
  // system with its own Server Action layer and zero UI for several of its
  // surfaces (Decision Queue included) — this is the first bridge.
  FOUNDER_DASHBOARD_LOOKUP: async (_principal) => {
    const dashboard = await getFounderDashboard();
    return {
      data: { summary: dashboard.summary, healthStatus: dashboard.health.overall, activeAlertCount: dashboard.activeAlerts.length },
      references: [{ type: "FOUNDER_DASHBOARD", id: "current", timestamp: dashboard.generatedAt.toISOString(), source: "Founder OS Dashboard" }],
      confidence: "VERY_HIGH",
      warnings: [],
    };
  },
  FOUNDER_DECISION_QUEUE_LOOKUP: async (_principal) => {
    const queue = await getDecisionQueue();
    return {
      data: {
        pendingApprovalsCount: queue.pendingApprovalsCount,
        pendingVendorPaymentCount: queue.pendingVendorPayments.length,
        highValueReceivableCount: queue.highValueReceivables.length,
        criticalExpenseCount: queue.criticalExpenses.length,
      },
      references: [{ type: "FOUNDER_DECISION_QUEUE", id: "current", timestamp: queue.asOf.toISOString(), source: "Founder OS Decision Queue" }],
      confidence: "VERY_HIGH",
      warnings: [],
    };
  },
  // Module 9 (lib/production/*) does NOT self-authorize — its own
  // actions/production.ts calls requireStaff()/requireAdmin() at the point
  // of use, not inside the lib functions themselves (confirmed by reading
  // it before writing this adapter). invokeTool's own requiredPermission
  // check runs on AiPrincipal's Sales-permission set, a different system
  // from lib/rbac's User.role — reusing requireStaff() here directly,
  // matching Module 9's own actual pattern exactly, rather than inventing
  // a new Sales-permission string that wouldn't correspond to anything.
  AI_PLATFORM_HEALTH_LOOKUP: async () => {
    await requireStaff();
    const [health, version] = await Promise.all([getSystemHealth(), Promise.resolve(getVersionRegistry())]);
    return {
      data: {
        overallStatus: health.overallStatus,
        layerCount: health.layers.length,
        unhealthyLayers: health.layers.filter((l) => l.status !== "HEALTHY").map((l) => ({ layer: l.layer, status: l.status })),
        architectureVersion: version.architectureVersion,
        aiVersion: version.aiVersion,
      },
      references: [{ type: "AI_PLATFORM_HEALTH", id: "current", timestamp: health.generatedAt, source: "Production Readiness (Module 9)" }],
      confidence: "VERY_HIGH",
      warnings: [],
    };
  },
};

export async function invokeTool(principal: AiPrincipal, code: string, input: Record<string, unknown>, workflowId: string, correlationId: string) {
  const tool = await prisma.aiToolDefinition.findUnique({ where: { code } });
  if (!tool || tool.status !== "ACTIVE" || !adapters[code]) throw new AppError("Tool is unavailable or unregistered", 503);
  if (tool.requiredPermission && !principal.isFounder && !principal.permissions.has(tool.requiredPermission)) throw new ForbiddenError("Tool permission denied");
  if (tool.allowedRoles.length && !tool.allowedRoles.includes(principal.roleName) && !principal.isFounder) throw new ForbiddenError("Tool role denied");
  const started = Date.now();
  const result = await Promise.race([adapters[code]!(principal, input), new Promise<never>((_, reject) => setTimeout(() => reject(new AppError("Tool timed out", 504)), tool.timeoutMs))]);
  await Promise.all([
    prisma.aiTelemetry.create({ data: { organizationKey: principal.organizationKey, userId: principal.id, roleName: principal.roleName, workflowId, toolCode: code, metricType: "TOOL_DURATION", value: Date.now() - started, unit: "ms", correlationId } }),
    prisma.salesAuditLog.create({ data: { userId: principal.id, module: "muv_ai_tool", action: "TOOL_EXECUTED", recordType: "AiToolDefinition", recordId: tool.id, newValue: { workflowId, correlationId, durationMs: Date.now() - started } } }),
  ]);
  return result;
}
