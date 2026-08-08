"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { savePlanSchema, submitEndOfDaySchema, saveRouteSchema, completeRouteSchema } from "@/lib/validations/inst-sales";

function startOfDay(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
}

/** Module 11 — Daily Planner. Morning → Route → Visits → Tasks → Notes → End of Day Summary. */
export async function savePlan(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_PLANNER_MANAGE);
    const data = savePlanSchema.parse(input);
    const planDate = startOfDay(data.planDate);

    const plan = await prisma.instDailyPlan.upsert({
      where: { officerId_planDate: { officerId: principal.id, planDate } },
      create: { officerId: principal.id, planDate, notes: data.notes },
      update: { notes: data.notes },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "DAILY_PLAN_SAVED", recordType: "InstDailyPlan", recordId: plan.id });
    revalidatePath("/os/sales/planner");
    return { success: true as const, data: plan };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function submitEndOfDay(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_PLANNER_MANAGE);
    const data = submitEndOfDaySchema.parse(input);
    const planDate = startOfDay(data.planDate);

    const plan = await prisma.instDailyPlan.upsert({
      where: { officerId_planDate: { officerId: principal.id, planDate } },
      create: { officerId: principal.id, planDate, endOfDaySummary: data.endOfDaySummary, submittedAt: new Date() },
      update: { endOfDaySummary: data.endOfDaySummary, submittedAt: new Date() },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "DAILY_PLAN_SUBMITTED", recordType: "InstDailyPlan", recordId: plan.id });
    revalidatePath("/os/sales/planner");
    return { success: true as const, data: plan };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Composes the day view from the officer's own visits/tasks/follow-ups by date — no separate join table to keep in sync (see schema note near InstDailyPlan). */
export async function getDayView(userId: string, date: Date) {
  try {
    await requirePermission(PERMISSIONS.INST_PLANNER_MANAGE);
    const from = startOfDay(date);
    const to = new Date(from); to.setHours(23, 59, 59, 999);

    const [plan, route, visits, tasks, followUps] = await Promise.all([
      prisma.instDailyPlan.findUnique({ where: { officerId_planDate: { officerId: userId, planDate: from } } }),
      prisma.instRoute.findUnique({ where: { officerId_routeDate: { officerId: userId, routeDate: from } } }),
      prisma.instVisit.findMany({ where: { officerId: userId, visitDate: { gte: from, lte: to } }, include: { customer: { select: { name: true } }, lead: { select: { organizationName: true } } }, orderBy: { visitDate: "asc" } }),
      prisma.instTask.findMany({ where: { assignedToId: userId, OR: [{ dueDate: { gte: from, lte: to } }, { dueDate: null, status: { in: ["PENDING", "IN_PROGRESS"] } }] }, orderBy: { dueDate: "asc" } }),
      prisma.instFollowUp.findMany({ where: { assignedToId: userId, dueDate: { gte: from, lte: to } }, include: { customer: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
    ]);

    return {
      success: true as const,
      data: {
        plan, route: route ? { ...route, plannedDistanceKm: route.plannedDistanceKm ? Number(route.plannedDistanceKm) : null, actualDistanceKm: route.actualDistanceKm ? Number(route.actualDistanceKm) : null } : null,
        visits: visits.map((v) => ({ ...v, checkInLat: v.checkInLat ? Number(v.checkInLat) : null, checkInLng: v.checkInLng ? Number(v.checkInLng) : null, checkOutLat: v.checkOutLat ? Number(v.checkOutLat) : null, checkOutLng: v.checkOutLng ? Number(v.checkOutLng) : null })),
        tasks, followUps,
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Module 13 — Route Management. */
export async function saveRoute(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_ROUTES_MANAGE);
    const data = saveRouteSchema.parse(input);
    const routeDate = startOfDay(data.routeDate);

    const route = await prisma.instRoute.upsert({
      where: { officerId_routeDate: { officerId: principal.id, routeDate } },
      create: { officerId: principal.id, routeDate, plannedStops: data.plannedStops, plannedDistanceKm: data.plannedDistanceKm, plannedTravelMinutes: data.plannedTravelMinutes, startedAt: new Date() },
      update: { plannedStops: data.plannedStops, plannedDistanceKm: data.plannedDistanceKm, plannedTravelMinutes: data.plannedTravelMinutes },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "ROUTE_PLANNED", recordType: "InstRoute", recordId: route.id });
    revalidatePath("/os/sales/planner");
    return { success: true as const, data: route };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function completeRoute(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_ROUTES_MANAGE);
    const data = completeRouteSchema.parse(input);
    const routeDate = startOfDay(data.routeDate);

    const route = await prisma.instRoute.update({
      where: { officerId_routeDate: { officerId: principal.id, routeDate } },
      data: { actualStops: data.actualStops, actualDistanceKm: data.actualDistanceKm, actualTravelMinutes: data.actualTravelMinutes, completedAt: new Date() },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "ROUTE_COMPLETED", recordType: "InstRoute", recordId: route.id });
    revalidatePath("/os/sales/planner");
    return { success: true as const, data: route };
  } catch (err) {
    return toErrorResponse(err);
  }
}
