"use server";

import { toErrorResponse } from "@/lib/errors";
import {
  proposeKnowledgeChange,
  decideKnowledgeChangeProposal,
  listChangeProposals,
  recordRecallEvent,
  listRecallEvents,
  listUsageReferences,
} from "@/lib/knowledge-factory/learning-service";

/**
 * MUV Intelligence Factory V4 §9 — Learning System (EP Sprint 8). Staff-
 * gated governance surface (proposals/recall events/usage review) —
 * `requireKnowledgeFactoryPrincipal` is enforced inside each service
 * function itself, matching every other Knowledge Factory action file
 * (actions/knowledge-factory.ts). Usage telemetry recording itself
 * (recordKnowledgeUsage) is deliberately NOT exposed here — it is written
 * only from inside lib/retrieval/orchestration-plan.ts, never accepted as
 * a direct caller-supplied write.
 */

export async function proposeChange(input: unknown) {
  try {
    const data = await proposeKnowledgeChange(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function decideChangeProposal(id: string, decision: "ACCEPTED" | "REJECTED" | "WITHDRAWN", resolutionNote: string) {
  try {
    const data = await decideKnowledgeChangeProposal(id, decision, resolutionNote);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getChangeProposals(input: { status?: string; targetType?: string; page?: number; pageSize?: number }) {
  try {
    const data = await listChangeProposals(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function reportRecallEvent(input: unknown) {
  try {
    const data = await recordRecallEvent(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getRecallEvents(input: { outcome?: string; targetType?: string; page?: number; pageSize?: number }) {
  try {
    const data = await listRecallEvents(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getUsageReferences(input: { targetType?: string; targetId?: string; page?: number; pageSize?: number }) {
  try {
    const data = await listUsageReferences(input);
    return { success: true as const, data };
  } catch (err) {
    return toErrorResponse(err);
  }
}
