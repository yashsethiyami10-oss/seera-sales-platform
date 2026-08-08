import type { NotificationPriority, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authorize } from "./authorization-service";
import { recordAudit } from "./audit-service";

const safeText=(maximum:number)=>z.string().min(1).max(maximum).refine(value=>!/[<>]/.test(value),"Markup is prohibited");
const payload = z.object({ recipientId: z.string().min(1), title: safeText(160), body: safeText(4000), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"), entityType: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/).optional(), entityId: z.string().max(160).optional(), actionPath: z.string().regex(/^\/(?!\/)(?!.*(?:\.\.|[<>]))[A-Za-z0-9/_?=&.-]{0,499}$/).optional() });
export async function createNotification(prisma: PrismaClient, actorId: string, input: unknown) {
  await authorize(prisma, { actorId, permission: "notifications:manage" }); const data = payload.parse(input);
  return prisma.notification.create({ data: { recipientId: data.recipientId, title: data.title, body: data.body, type: "FOUNDATION", priority: data.priority as NotificationPriority, entityType: data.entityType, entityId: data.entityId, payload: data.actionPath ? { actionPath: data.actionPath } : undefined } });
}
export async function listNotifications(prisma: PrismaClient, actorId: string, recipientId: string, cursor?: string) {
  await authorize(prisma, { actorId, permission: "notifications:view" }); if (actorId !== recipientId) throw Object.assign(new Error("Cross-user notification access denied"), { code: "CROSS_USER_ACCESS_DENIED", status: 403 });
  return prisma.notification.findMany({ where: { recipientId }, take: 50, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { createdAt: "desc" } });
}
export async function markNotificationRead(prisma: PrismaClient, actorId: string, notificationId: string) {
  await authorize(prisma, { actorId, permission: "notifications:view" }); const item = await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
  if (item.recipientId !== actorId) throw Object.assign(new Error("Cross-user notification mutation denied"), { code: "CROSS_USER_ACCESS_DENIED", status: 403 });
  const updated = await prisma.notification.update({ where: { id: notificationId }, data: { status: "READ", readAt: new Date() } }); await recordAudit(prisma, { actorId, action: "notification.read", entityType: "Notification", entityId: notificationId }); return updated;
}
export async function archiveNotification(prisma: PrismaClient,actorId:string,notificationId:string){await authorize(prisma,{actorId,permission:"notifications:view"});const item=await prisma.notification.findUniqueOrThrow({where:{id:notificationId}});if(item.recipientId!==actorId)throw Object.assign(new Error("Cross-user notification mutation denied"),{code:"CROSS_USER_ACCESS_DENIED",status:403});const updated=await prisma.notification.update({where:{id:notificationId},data:{status:"ARCHIVED",archivedAt:new Date()}});await recordAudit(prisma,{actorId,action:"notification.archived",entityType:"Notification",entityId:notificationId});return updated;}
