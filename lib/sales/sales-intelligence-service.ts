import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";

/**
 * MUV AI Engineering Execution — Sprint 11 (Domain Foundations). Sales
 * Intelligence Foundation for the Institutional Sales OS — deliberately
 * NOT a duplicate of CustomerIntelligenceProfile (Phase 6), which already
 * covers customer-level purchase history/segment/status; this operates one
 * level down, at the individual InstOpportunity (deal) level, a concept
 * with no prior coverage anywhere in the codebase (confirmed by research
 * before this sprint). Follows the Institutional Sales OS's own convention
 * (requirePermission, no organizationKey) rather than the Enterprise v3
 * Knowledge Factory convention, since InstOpportunity is that OS's table.
 *
 * Append-only snapshots (mirrors CustomerIntelligenceSnapshot's pattern) —
 * a new snapshot is written on every computation, never mutating a prior
 * one, so deal-health trend over time is preserved for a future dashboard.
 */

const DEAL_HEALTH_SCORE_VERSION = "v1";

/** Deterministic, evidence-traceable formula — same "never manufacture a
 * score" discipline as lib/intelligence's engines. WON/LOST short-circuit
 * to the two extremes; everything else starts from the opportunity's own
 * stored probability, then applies a bounded inactivity penalty and a
 * quotation-acceptance bonus. */
function computeDealHealth(params: { stage: string; probability: number; daysSinceLastActivity: number; acceptedQuotationCount: number }) {
  const evidence: string[] = [];
  if (params.stage === "WON") return { score: 100, evidence: ["stage is WON"] };
  if (params.stage === "LOST") return { score: 0, evidence: ["stage is LOST"] };

  evidence.push(`base probability ${params.probability}`);
  let score = params.probability;

  const inactivityPenalty = Math.min(40, params.daysSinceLastActivity * 2);
  if (inactivityPenalty > 0) {
    score -= inactivityPenalty;
    evidence.push(`-${inactivityPenalty} for ${params.daysSinceLastActivity} day(s) since last activity (capped at -40)`);
  }

  if (params.acceptedQuotationCount > 0) {
    score += 10;
    evidence.push(`+10 for ${params.acceptedQuotationCount} accepted quotation(s)`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, evidence };
}

function levelForScore(score: number): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  // HIGH = healthiest; URGENT = at risk of stalling, needs attention now —
  // see the schema comment on SalesIntelligenceSnapshot.dealHealthLevel.
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 15) return "LOW";
  return "URGENT";
}

export async function computeSalesIntelligence(opportunityId: string) {
  const principal = await requirePermission(PERMISSIONS.INST_OPPORTUNITIES_MANAGE);
  const opportunity = await prisma.instOpportunity.findUnique({
    where: { id: opportunityId },
    include: { quotations: { include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } } },
  });
  if (!opportunity) throw new NotFoundError("Opportunity");

  const quotationCount = opportunity.quotations.length;
  const acceptedQuotationCount = opportunity.quotations.filter((q) => q.versions[0]?.status === "ACCEPTED").length;
  const quotationAcceptanceRate = quotationCount > 0 ? acceptedQuotationCount / quotationCount : 0;
  const daysSinceLastActivity = Math.max(0, Math.floor((Date.now() - opportunity.updatedAt.getTime()) / (1000 * 60 * 60 * 24)));

  const { score, evidence } = computeDealHealth({ stage: opportunity.stage, probability: opportunity.probability, daysSinceLastActivity, acceptedQuotationCount });
  const level = opportunity.stage === "WON" ? "HIGH" : opportunity.stage === "LOST" ? "URGENT" : levelForScore(score);

  const snapshot = await prisma.salesIntelligenceSnapshot.create({
    data: {
      opportunityId, stage: opportunity.stage, daysSinceLastActivity, quotationCount, acceptedQuotationCount,
      quotationAcceptanceRate, dealHealthScore: score, dealHealthLevel: level, evidence, calculationVersion: DEAL_HEALTH_SCORE_VERSION,
    },
  });

  await appendAuditLog({ userId: principal.id, module: "sales_intelligence", action: "SALES_INTELLIGENCE_COMPUTED", recordType: "SalesIntelligenceSnapshot", recordId: snapshot.id, newValue: { opportunityId, dealHealthScore: score, dealHealthLevel: level } }).catch(() => {});

  return snapshot;
}

export async function getLatestSalesIntelligence(opportunityId: string) {
  await requirePermission(PERMISSIONS.INST_OPPORTUNITIES_VIEW_ASSIGNED);
  return prisma.salesIntelligenceSnapshot.findFirst({ where: { opportunityId }, orderBy: { generatedAt: "desc" } });
}

export async function listSalesIntelligenceHistory(opportunityId: string, limit = 20) {
  await requirePermission(PERMISSIONS.INST_OPPORTUNITIES_VIEW_ASSIGNED);
  return prisma.salesIntelligenceSnapshot.findMany({ where: { opportunityId }, orderBy: { generatedAt: "desc" }, take: Math.min(100, Math.max(1, limit)) });
}
