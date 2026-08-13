import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";

// Spec section 9: Departments initially Sales/Marketing/Warehouse/Administration/
// Manufacturing/Distribution/Finance/Other. Other dimension kinds (COST_CENTER,
// CHANNEL, EMPLOYEE, CAMPAIGN) start empty and are created on demand — a
// Department list is the only one the Founder needs pre-populated to tag
// day-one transactions.
const DEFAULT_DEPARTMENTS = ["Sales", "Marketing", "Warehouse", "Administration", "Manufacturing", "Distribution", "Finance", "Other"];

export async function seedDefaultDimensions(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "coa:manage" });
  const results = [];
  for (const name of DEFAULT_DEPARTMENTS) {
    const code = name.toUpperCase().replace(/[^A-Z]/g, "_");
    results.push(await db.seeraFinancialDimension.upsert({ where: { kind_code: { kind: "DEPARTMENT", code } }, update: {}, create: { kind: "DEPARTMENT", code, name } }));
  }
  await recordAudit(db, { actorId, action: "finance.dimensions.seeded", entityType: "SeeraFinancialDimension", entityId: "bulk", afterState: { count: results.length } });
  return results;
}

export async function createDimension(db: PrismaClient, actorId: string, input: { kind: string; code: string; name: string }) {
  await authorize(db, { actorId, permission: "coa:manage" });
  const dimension = await db.seeraFinancialDimension.create({ data: input });
  await recordAudit(db, { actorId, action: "finance.dimension.created", entityType: "SeeraFinancialDimension", entityId: dimension.id, afterState: input });
  return dimension;
}

export async function listDimensions(db: PrismaClient, actorId: string, kind?: string) {
  await authorize(db, { actorId, permission: "gl:view" });
  return db.seeraFinancialDimension.findMany({ where: { kind, isActive: true }, orderBy: { name: "asc" } });
}
