"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAiPrincipal } from "@/lib/muv-ai/authorization";
import { requireAiPermission } from "@/lib/muv-ai/security";
import { createConversation, mutateConversation } from "@/lib/muv-ai/conversations";
import { submitGovernedMessage } from "@/lib/muv-ai/orchestrator";
import { createActionRequest, decideAction } from "@/lib/muv-ai/workflow";
import { prisma } from "@/lib/prisma";

export async function createAiConversationAction(formData: FormData) {
  const principal = await getAiPrincipal(); requireAiPermission(principal, "ai.conversations.use");
  const title = z.string().min(1).max(160).parse(formData.get("title"));
  const row = await createConversation(principal, title); revalidatePath("/sales/ai"); redirect(`/sales/ai/${row.id}`);
}
export async function mutateAiConversationAction(input: unknown) {
  const principal = await getAiPrincipal(); requireAiPermission(principal, "ai.conversations.use");
  const data = z.object({ id: z.string().cuid(), operation: z.enum(["RENAME","PIN","ARCHIVE","RESTORE","CLOSE","DELETE"]), value: z.string().max(160).optional() }).parse(input);
  const row = await mutateConversation(principal, data.id, data.operation, data.value); revalidatePath("/sales/ai"); return row;
}
export async function submitAiMessageAction(formData: FormData) {
  const principal = await getAiPrincipal(); requireAiPermission(principal, "ai.conversations.use");
  const data = z.object({ conversationId: z.string().cuid(), message: z.string().min(1).max(8000), module: z.string().max(50).optional(), actionPayload: z.string().max(4000).optional() }).parse(Object.fromEntries(formData));
  // Sprint 12 (Support AI) — actionPayload is an optional JSON-stringified
  // FormData field (e.g. a "Create Ticket" form's structured fields), never
  // derived from the free-text `message`. Malformed JSON is a validation
  // error like any other bad input, not silently ignored.
  const actionPayload = data.actionPayload ? z.record(z.unknown()).parse(JSON.parse(data.actionPayload)) : undefined;
  await submitGovernedMessage(principal, data.conversationId, data.message, { module: data.module, actionPayload }); revalidatePath(`/sales/ai/${data.conversationId}`);
}
export async function proposeAiActionAction(input: unknown) {
  const principal = await getAiPrincipal(); requireAiPermission(principal, "ai.actions.propose");
  const data = z.object({ conversationId: z.string().cuid(), workflowId: z.string().cuid(), agentCode: z.string(), actionType: z.string(), targetEntity: z.string(), targetRecordId: z.string().optional(), targetVersion: z.string().optional(), payload: z.record(z.unknown()), preview: z.record(z.unknown()), idempotencyKey: z.string().min(12) }).parse(input);
  return createActionRequest(principal, { ...data, payload: data.payload as Prisma.InputJsonValue, preview: data.preview as Prisma.InputJsonValue });
}
export async function decideAiActionAction(input: unknown) {
  const principal = await getAiPrincipal(); requireAiPermission(principal, "ai.actions.approve");
  const data = z.object({ actionId: z.string().cuid(), decision: z.enum(["APPROVED","REJECTED"]), reason: z.string().min(3) }).parse(input);
  return decideAction(principal, data.actionId, data.decision, data.reason);
}
export async function setAiKillSwitchAction(input: unknown) {
  const principal = await getAiPrincipal(); requireAiPermission(principal, "ai.operations.manage");
  const data = z.object({ enabled: z.boolean(), reason: z.string().min(5) }).parse(input);
  const row = await prisma.$transaction(async tx => {
    const updated = await tx.aiConfiguration.update({ where: { organizationKey_key: { organizationKey: principal.organizationKey, key: "AI_KILL_SWITCH" } }, data: { value: { enabled: data.enabled, reason: data.reason, changedAt: new Date().toISOString() }, updatedById: principal.id, version: { increment: 1 } } });
    await tx.salesAuditLog.create({ data: { userId: principal.id, module: "muv_ai_governance", action: data.enabled ? "KILL_SWITCH_ACTIVATED" : "KILL_SWITCH_DEACTIVATED", recordType: "AiConfiguration", recordId: updated.id, newValue: { reason: data.reason } } });
    await tx.notificationLog.create({ data: { channel: "DASHBOARD", type: "AI_KILL_SWITCH", recipient: principal.email ?? principal.id, status: "PENDING" } });
    return updated;
  }); revalidatePath("/sales/ai/admin"); return row;
}
