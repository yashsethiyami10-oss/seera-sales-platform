import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

export async function createMachine(db: PrismaClient, actorId: string, input: { code: string; name: string; type?: string; locationId?: string; capacity?: string; notes?: string }) {
  await authorize(db, { actorId, permission: "mfg_machine_shift:manage" });
  const existing = await db.seeraManufacturingMachine.findUnique({ where: { code: input.code } });
  if (existing) throw new FoundationError("MACHINE_CODE_EXISTS", "A machine with this code already exists", 409);
  const machine = await db.seeraManufacturingMachine.create({ data: input });
  await recordAudit(db, { actorId, action: "mfg.machine.created", entityType: "SeeraManufacturingMachine", entityId: machine.id, afterState: { code: machine.code, name: machine.name } });
  return machine;
}

export async function updateMachine(db: PrismaClient, actorId: string, machineId: string, input: Partial<{ name: string; type: string; locationId: string; capacity: string; notes: string; isActive: boolean }>) {
  await authorize(db, { actorId, permission: "mfg_machine_shift:manage" });
  const before = await db.seeraManufacturingMachine.findUniqueOrThrow({ where: { id: machineId } });
  const after = await db.seeraManufacturingMachine.update({ where: { id: machineId }, data: input });
  await recordAudit(db, { actorId, action: "mfg.machine.updated", entityType: "SeeraManufacturingMachine", entityId: machineId, beforeState: { isActive: before.isActive }, afterState: { isActive: after.isActive } });
  return after;
}

export async function listMachines(db: PrismaClient, actorId: string, activeOnly = false) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraManufacturingMachine.findMany({ where: activeOnly ? { isActive: true } : undefined, orderBy: { code: "asc" } });
}

export async function createShift(db: PrismaClient, actorId: string, input: { name: string; startTime: string; endTime: string }) {
  await authorize(db, { actorId, permission: "mfg_machine_shift:manage" });
  const existing = await db.seeraManufacturingShift.findUnique({ where: { name: input.name } });
  if (existing) throw new FoundationError("SHIFT_NAME_EXISTS", "A shift with this name already exists", 409);
  const shift = await db.seeraManufacturingShift.create({ data: input });
  await recordAudit(db, { actorId, action: "mfg.shift.created", entityType: "SeeraManufacturingShift", entityId: shift.id, afterState: { name: shift.name } });
  return shift;
}

export async function updateShift(db: PrismaClient, actorId: string, shiftId: string, input: Partial<{ name: string; startTime: string; endTime: string; isActive: boolean }>) {
  await authorize(db, { actorId, permission: "mfg_machine_shift:manage" });
  const before = await db.seeraManufacturingShift.findUniqueOrThrow({ where: { id: shiftId } });
  const after = await db.seeraManufacturingShift.update({ where: { id: shiftId }, data: input });
  await recordAudit(db, { actorId, action: "mfg.shift.updated", entityType: "SeeraManufacturingShift", entityId: shiftId, beforeState: { isActive: before.isActive }, afterState: { isActive: after.isActive } });
  return after;
}

export async function listShifts(db: PrismaClient, actorId: string, activeOnly = false) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraManufacturingShift.findMany({ where: activeOnly ? { isActive: true } : undefined, orderBy: { name: "asc" } });
}
