import type { Prisma, PrismaClient, SettingValueType } from "@prisma/client";
import { authorize } from "./authorization-service";
import { recordAudit } from "./audit-service";
import { FoundationError } from "./errors";
import { PHASE_1_FEATURE_FLAGS } from "./rbac-catalog";

export const PHASE_1_SETTING_KEYS = new Set(["security.session.max_age_hours", "foundation.test", "manufacturing.company_inventory_mode"]);

function validateValue(type: SettingValueType, value: Prisma.InputJsonValue) {
  if ((type === "STRING" && typeof value !== "string") || (type === "NUMBER" && typeof value !== "number") || (type === "BOOLEAN" && typeof value !== "boolean")) throw new FoundationError("SETTING_TYPE_MISMATCH", "Setting value does not match its declared type");
}
export async function updateSetting(prisma: PrismaClient, actorId: string, input: { key: string; category: string; valueType: SettingValueType; value: Prisma.InputJsonValue; reason: string }) {
  await authorize(prisma, { actorId, permission: "settings:manage" }); if(!PHASE_1_SETTING_KEYS.has(input.key))throw new FoundationError("UNKNOWN_SETTING_KEY","Setting key is not approved",400); if(/secret|password|token|credential/i.test(input.key))throw new FoundationError("SENSITIVE_SETTING_PROHIBITED","Secrets must remain environment-managed",400); validateValue(input.valueType, input.value);
  const before = await prisma.appSetting.findUnique({ where: { key: input.key } });
  const setting = await prisma.appSetting.upsert({ where: { key: input.key }, update: { category: input.category, valueType: input.valueType, value: input.value, updatedById: actorId, changeReason: input.reason, version: { increment: 1 } }, create: { key: input.key, category: input.category, valueType: input.valueType, value: input.value, updatedById: actorId, changeReason: input.reason } });
  await recordAudit(prisma, { actorId, action: "settings.update", entityType: "AppSetting", entityId: setting.id, reason: input.reason, beforeState: before ? { version: before.version } : undefined, afterState: { key: setting.key, version: setting.version } }); return setting;
}
export async function setFeatureFlag(prisma: PrismaClient, actorId: string, key: string, enabled: boolean, reason: string) {
  await authorize(prisma, { actorId, permission: "feature_flags:manage" });
  if(!(PHASE_1_FEATURE_FLAGS as readonly string[]).includes(key))throw new FoundationError("UNKNOWN_FEATURE_FLAG","Feature flag is not approved",400);
  const before = await prisma.featureFlag.findUniqueOrThrow({ where: { key } });
  const flag = await prisma.featureFlag.update({ where: { key }, data: { enabled, updatedById: actorId, changeReason: reason } });
  await recordAudit(prisma, { actorId, action: "feature_flag.update", entityType: "FeatureFlag", entityId: flag.id, reason, beforeState: { enabled: before.enabled }, afterState: { enabled } }); return flag;
}
