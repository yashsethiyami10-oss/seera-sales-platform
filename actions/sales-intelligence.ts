"use server";

import { toErrorResponse } from "@/lib/errors";
import { computeSalesIntelligence, getLatestSalesIntelligence, listSalesIntelligenceHistory } from "@/lib/sales/sales-intelligence-service";

/**
 * MUV AI Engineering Execution — Sprint 11 (Domain Foundations). Server
 * Action boundary for the Sales Intelligence Foundation — every export
 * independently calls requirePermission itself inside the service layer
 * (lib/sales/sales-intelligence-service.ts), matching this codebase's own
 * "every exported action must enforce its own auth" rule (see CLAUDE.md).
 */

export async function recomputeSalesIntelligence(opportunityId: string) {
  try {
    const data = await computeSalesIntelligence(opportunityId);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getSalesIntelligence(opportunityId: string) {
  try {
    const data = await getLatestSalesIntelligence(opportunityId);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getSalesIntelligenceHistory(opportunityId: string, limit?: number) {
  try {
    const data = await listSalesIntelligenceHistory(opportunityId, limit);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}
