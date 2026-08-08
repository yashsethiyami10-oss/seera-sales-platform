"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { requirePermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { updateEmployeeSchema } from "@/lib/validations/master-data";
import { z } from "zod";

/**
 * MUV OS™ — Milestone 2 (Customer & Master Data Foundation), Employee
 * Master.
 *
 * Deliberately edits the existing `User` record rather than a new
 * "Employee" table — an internal employee already *is* a User with a
 * base Role (STAFF/ADMIN), a SalesRole, a reporting hierarchy, and a
 * Territory. This file scopes itself to viewing that data and editing the
 * fields this milestone actually added (department, designation) plus
 * reassigning the already-existing reporting manager/territory/status —
 * it deliberately does not create new Users (account creation/invitation
 * is a distinct, sensitive flow this milestone does not touch).
 */
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.string().cuid().optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export async function listEmployees(input?: unknown) {
  try {
    await getSalesPrincipal();
    const query = listQuery.parse(input ?? {});
    const where = {
      AND: [
        { role: { in: ["ADMIN", "STAFF"] as Role[] } },
        query.active !== undefined ? { active: query.active } : {},
        query.departmentId ? { departmentId: query.departmentId } : {},
        query.q
          ? { OR: [{ name: { contains: query.q, mode: "insensitive" as const } }, { email: { contains: query.q, mode: "insensitive" as const } }] }
          : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy: { name: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        select: {
          id: true, name: true, email: true, role: true, designation: true, active: true,
          department: { select: { id: true, name: true } },
          salesRole: { select: { name: true } },
          territory: { select: { name: true } },
          reportingManager: { select: { id: true, name: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return {
      success: true as const,
      data: { items, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getEmployeeDetail(id: string) {
  try {
    await getSalesPrincipal();
    const employee = await prisma.user.findFirst({
      where: { id, role: { in: ["ADMIN", "STAFF"] } },
      select: {
        id: true, name: true, email: true, role: true, designation: true, active: true, createdAt: true,
        department: true,
        salesRole: { select: { id: true, name: true } },
        territory: { select: { id: true, name: true } },
        reportingManager: { select: { id: true, name: true, email: true } },
        directReports: { select: { id: true, name: true, email: true } },
      },
    });
    if (!employee) throw new NotFoundError("Employee");
    return { success: true as const, data: employee };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateEmployee(input: unknown) {
  try {
    await requirePermission(PERMISSIONS.EMPLOYEES_MANAGE);
    const { id, ...data } = updateEmployeeSchema.parse(input);

    const existing = await prisma.user.findFirst({ where: { id, role: { in: ["ADMIN", "STAFF"] } } });
    if (!existing) throw new NotFoundError("Employee");
    if (data.reportingManagerId === id) throw new Error("An employee cannot report to themselves");

    const updated = await prisma.user.update({ where: { id }, data });
    revalidatePath("/os/employees");
    revalidatePath(`/os/employees/${id}`);
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}
