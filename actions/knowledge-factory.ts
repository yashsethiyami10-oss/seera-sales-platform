"use server";

import { revalidatePath } from "next/cache";
import { toErrorResponse } from "@/lib/errors";

import * as sourceRegistry from "@/lib/knowledge-factory/source-registry-service";
import * as conflictService from "@/lib/knowledge-factory/conflict-service";
import * as governanceService from "@/lib/knowledge-factory/governance-service";

/**
 * MUV Intelligence Factory V4 — Knowledge Factory. The MUV-OS-shell
 * "use server" boundary, matching every prior Enterprise v3 module's
 * actions/*.ts pattern exactly. Every wrapped call self-enforces its own
 * permission/feature-flag check inside requireKnowledgeFactoryPrincipal —
 * this file adds no new authorization logic.
 *
 * Every export is declared `async` directly on the arrow function — see
 * Milestone 8's own build-time lesson (Next.js rejects a bare arrow that
 * merely returns a Promise for a Server Action).
 */

const revalidateKnowledgeFactory = () => revalidatePath("/os/knowledge-factory", "layout");
async function run<T>(fn: () => Promise<T>) {
  try { const data = await fn(); revalidateKnowledgeFactory(); return { success: true as const, data }; }
  catch (err) { return toErrorResponse(err); }
}
async function read<T>(fn: () => Promise<T>) {
  try { return { success: true as const, data: await fn() }; } catch (err) { return toErrorResponse(err); }
}

// --- Source Registry (Sprint 2) ---
export const registerSource = async (input: unknown) => run(() => sourceRegistry.registerSource(input));
export const markSourceSuperseded = async (newDocumentId: string, oldDocumentId: string) => run(() => sourceRegistry.markSuperseded(newDocumentId, oldDocumentId));
export const retireSource = async (id: string, reason: string) => run(() => sourceRegistry.retireSource(id, reason));
export const verifySource = async (id: string) => run(() => sourceRegistry.verifySource(id));
export const getSource = async (id: string) => read(() => sourceRegistry.getSource(id));
export const listSources = async (input: Parameters<typeof sourceRegistry.listSources>[0]) => read(() => sourceRegistry.listSources(input));
export const recordProvenance = async (input: unknown) => run(() => sourceRegistry.recordProvenance(input));
export const getProvenanceFor = async (targetType: string, targetId: string) => read(() => sourceRegistry.getProvenanceFor(targetType, targetId));

// --- Conflict Queue (Sprint 3) ---
export const createConflict = async (input: unknown) => run(() => conflictService.createConflict(input));
export const resolveConflict = async (id: string, resolutionNote: string) => run(() => conflictService.resolveConflict(id, resolutionNote));
export const acceptConflictAsKnownLimitation = async (id: string, resolutionNote: string) => run(() => conflictService.acceptAsKnownLimitation(id, resolutionNote));
export const listConflicts = async (input: Parameters<typeof conflictService.listConflicts>[0]) => read(() => conflictService.listConflicts(input));

// --- Governance (Sprint 4) ---
export const grantApprovalAuthority = async (input: unknown) => run(() => governanceService.grantApprovalAuthority(input));
export const revokeApprovalAuthority = async (id: string, reason: string) => run(() => governanceService.revokeApprovalAuthority(id, reason));
export const listApprovalAuthorities = async (principalId?: string) => read(() => governanceService.listApprovalAuthorities(principalId));
export const listHardMakerCheckerCategories = async () => read(() => governanceService.listHardMakerCheckerCategories());
