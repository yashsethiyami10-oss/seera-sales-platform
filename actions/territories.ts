"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { requirePermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { territorySchema, updateTerritorySchema } from "@/lib/validations/master-data";
import { z } from "zod";

/**
 * MUV OS™ — Milestone 2 (Customer & Master Data Foundation), Territory
 * Master. Reuses the existing, already-hierarchical `Territory` model
 * (already linked to Customers/Users/Orders/Quotations/Opportunities) —
 * "State, City, Area, Territory" are levels of this one model (see the
 * `level` field added to it this milestone), not four new tables.
 * `TERRITORIES_MANAGE` already existed as a permission before this
 * milestone; reused unchanged.
 */
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  level: z.enum(["STATE", "CITY", "AREA", "TERRITORY"]).optional(),
  parentTerritoryId: z.string().cuid().optional(),
  activeOnly: z.boolean().default(false),
});

export async function listTerritories(input?: unknown) {
  try {
    await getSalesPrincipal();
    const query = listQuery.parse(input ?? {});
    const items = await prisma.territory.findMany({
      where: {
        AND: [
          query.activeOnly ? { active: true } : {},
          query.level ? { level: query.level } : {},
          query.parentTerritoryId !== undefined ? { parentTerritoryId: query.parentTerritoryId } : {},
          query.q ? { name: { contains: query.q, mode: "insensitive" } } : {},
        ],
      },
      orderBy: [{ level: "asc" }, { name: "asc" }],
      include: { parent: { select: { id: true, name: true } }, _count: { select: { children: true, customers: true, users: true } } },
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function createTerritory(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.TERRITORIES_MANAGE);
    const data = territorySchema.parse(input);
    const territory = await prisma.territory.create({ data });
    revalidatePath("/os/territories");
    return { success: true as const, data: territory };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateTerritory(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.TERRITORIES_MANAGE);
    const { id, ...data } = updateTerritorySchema.parse(input);
    if (data.parentTerritoryId === id) throw new Error("A territory cannot be its own parent");

    const existing = await prisma.territory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Territory");

    const updated = await prisma.territory.update({ where: { id }, data });
    revalidatePath("/os/territories");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}
