import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { AiPrincipal } from "./types";

export async function createConversation(principal: AiPrincipal, title: string, type = "GENERAL") {
  if (!title.trim()) throw new AppError("Conversation title is required");
  return prisma.$transaction(async tx => {
    const conversation = await tx.aiConversation.create({ data: { organizationKey: principal.organizationKey, ownerId: principal.id, title: title.trim(), conversationType: type } });
    await tx.aiSession.create({ data: { organizationKey: principal.organizationKey, conversationId: conversation.id, userId: principal.id, expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await tx.salesAuditLog.create({ data: { userId: principal.id, module: "muv_ai", action: "CONVERSATION_CREATED", recordType: "AiConversation", recordId: conversation.id } });
    return conversation;
  });
}
export async function listConversations(principal: AiPrincipal, query: { search?: string; status?: string; page?: number; take?: number }) {
  const page = Math.max(1, query.page ?? 1), take = Math.min(100, Math.max(1, query.take ?? 25));
  const where = { organizationKey: principal.organizationKey, deletedAt: null, ...(!principal.isFounder && !principal.permissions.has("ai.conversations.manage") ? { OR: [{ ownerId: principal.id }, { participants: { has: principal.id } }] } : {}), ...(query.status ? { status: query.status } : {}), ...(query.search ? { OR: [{ title: { contains: query.search, mode: "insensitive" as const } }, { tags: { has: query.search } }] } : {}) };
  const [total, rows] = await Promise.all([prisma.aiConversation.count({ where }), prisma.aiConversation.findMany({ where, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], skip: (page - 1) * take, take })]);
  return { rows, total, page, take, pageCount: Math.ceil(total / take) };
}
export async function mutateConversation(principal: AiPrincipal, id: string, operation: "RENAME"|"PIN"|"ARCHIVE"|"RESTORE"|"CLOSE"|"DELETE", value?: string) {
  return prisma.$transaction(async tx => {
    const row = await tx.aiConversation.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!row) throw new NotFoundError("AI conversation");
    if (row.ownerId !== principal.id && !principal.isFounder && !principal.permissions.has("ai.conversations.manage")) throw new ForbiddenError();
    const data = operation === "RENAME" ? { title: value?.trim() || row.title } : operation === "PIN" ? { pinned: !row.pinned } : operation === "ARCHIVE" ? { status: "ARCHIVED", archivedAt: new Date() } : operation === "RESTORE" ? { status: "ACTIVE", archivedAt: null, deletedAt: null } : operation === "CLOSE" ? { status: "CLOSED", closedAt: new Date() } : { status: "DELETED", deletedAt: new Date() };
    const updated = await tx.aiConversation.update({ where: { id }, data });
    await tx.salesAuditLog.create({ data: { userId: principal.id, module: "muv_ai", action: `CONVERSATION_${operation}`, recordType: "AiConversation", recordId: id } });
    return updated;
  });
}
