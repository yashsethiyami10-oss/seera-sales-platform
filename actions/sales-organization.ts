"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { appendAuditLog } from "@/lib/sales/audit";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";

const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
  salesRoleId: z.string().cuid(),
  territoryId: z.string().cuid().nullable().optional(),
  reportingManagerId: z.string().cuid().nullable().optional(),
});

export async function createSalesUser(input: z.input<typeof userSchema>) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const data = userSchema.parse(input);
    const { password, ...profile } = data;
    if (data.reportingManagerId) {
      const manager = await prisma.user.findUnique({ where: { id: data.reportingManagerId }, select: { id: true } });
      if (!manager) throw new Error("Reporting manager not found");
    }
    const user = await prisma.user.create({
      data: { ...profile, passwordHash: await bcrypt.hash(password, 12), role: "STAFF" },
      select: { id: true, name: true, email: true, salesRoleId: true, territoryId: true, reportingManagerId: true },
    });
    await appendAuditLog({ userId: actor.id, module: "organization", action: "USER_CREATED", recordType: "User", recordId: user.id, newValue: user });
    revalidatePath("/sales/organization");
    return { success: true as const, data: user };
  } catch (error) {
    return toErrorResponse(error);
  }
}

const assignmentSchema = z.object({
  userId: z.string().cuid(), salesRoleId: z.string().cuid(),
  territoryId: z.string().cuid().nullable(), reportingManagerId: z.string().cuid().nullable(),
  active: z.boolean(),
});

export async function updateSalesUserAssignment(input: z.input<typeof assignmentSchema>) {
  try {
    const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const data = assignmentSchema.parse(input);
    if (data.userId === data.reportingManagerId) throw new Error("A user cannot report to themselves");
    let managerId = data.reportingManagerId;
    while (managerId) {
      if (managerId === data.userId) throw new Error("Reporting relationships cannot contain a cycle");
      const manager: { reportingManagerId: string | null } | null = await prisma.user.findUnique({
        where: { id: managerId }, select: { reportingManagerId: true },
      });
      if (!manager) throw new Error("Reporting manager not found");
      managerId = manager.reportingManagerId;
    }
    const previous = await prisma.user.findUniqueOrThrow({ where: { id: data.userId }, select: { salesRoleId: true, territoryId: true, reportingManagerId: true, active: true } });
    const updated = await prisma.user.update({
      where: { id: data.userId },
      data: { salesRoleId: data.salesRoleId, territoryId: data.territoryId, reportingManagerId: data.reportingManagerId, active: data.active },
      select: { id: true, salesRoleId: true, territoryId: true, reportingManagerId: true, active: true },
    });
    await appendAuditLog({ userId: actor.id, module: "organization", action: "USER_UPDATED", recordType: "User", recordId: updated.id, previousValue: previous, newValue: updated });
    revalidatePath("/sales/organization");
    return { success: true as const, data: updated };
  } catch (error) {
    return toErrorResponse(error);
  }
}

const territorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/),
  parentTerritoryId: z.string().cuid().nullable().optional(),
});

export async function createTerritory(input: z.input<typeof territorySchema>) {
  try {
    const actor = await requirePermission(PERMISSIONS.TERRITORIES_MANAGE);
    const data = territorySchema.parse(input);
    const territory = await prisma.territory.create({ data });
    await appendAuditLog({ userId: actor.id, module: "territories", action: "TERRITORY_CREATED", recordType: "Territory", recordId: territory.id, newValue: territory });
    revalidatePath("/sales/territories");
    return { success: true as const, data: territory };
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function setRolePermissions(roleId: string, permissionIds: string[]) {
  try {
    const actor = await requirePermission(PERMISSIONS.PERMISSIONS_MANAGE);
    const parsed = z.object({ roleId: z.string().cuid(), permissionIds: z.array(z.string().cuid()).max(200) }).parse({ roleId, permissionIds });
    const previous = await prisma.salesRolePermission.findMany({ where: { roleId: parsed.roleId }, select: { permissionId: true } });
    await prisma.$transaction([
      prisma.salesRolePermission.deleteMany({ where: { roleId: parsed.roleId } }),
      prisma.salesRolePermission.createMany({ data: parsed.permissionIds.map((permissionId) => ({ roleId: parsed.roleId, permissionId })), skipDuplicates: true }),
    ]);
    await appendAuditLog({ userId: actor.id, module: "organization", action: "PERMISSIONS_UPDATED", recordType: "SalesRole", recordId: parsed.roleId, previousValue: previous, newValue: parsed.permissionIds });
    revalidatePath("/sales/organization");
    return { success: true as const };
  } catch (error) {
    return toErrorResponse(error);
  }
}
