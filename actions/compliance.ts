"use server";

import { toErrorResponse } from "@/lib/errors";
import {
  registerRequirement,
  retireRequirement,
  recordCompliance,
  getComplianceStatus,
  listRequirements,
  listNonCompliantTargets,
} from "@/lib/knowledge-factory/compliance-service";

/**
 * MUV AI Engineering Execution — Sprint 11 (Domain Foundations). Server
 * Action boundary for the generic Compliance Requirement registry —
 * matches actions/knowledge-factory.ts's own established pattern (thin
 * wrappers, every function independently authorizes via
 * requireKnowledgeFactoryPrincipal inside the service layer itself).
 */

export async function registerComplianceRequirement(input: unknown) {
  try {
    const data = await registerRequirement(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function retireComplianceRequirement(id: string) {
  try {
    const data = await retireRequirement(id);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function recordComplianceStatus(input: unknown) {
  try {
    const data = await recordCompliance(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getTargetComplianceStatus(targetType: string, targetId: string) {
  try {
    const data = await getComplianceStatus(targetType, targetId);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getComplianceRequirements(input: { scopeType?: string; status?: string; page?: number; pageSize?: number }) {
  try {
    const data = await listRequirements(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getNonCompliantTargets(scopeType: string) {
  try {
    const data = await listNonCompliantTargets(scopeType);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}
