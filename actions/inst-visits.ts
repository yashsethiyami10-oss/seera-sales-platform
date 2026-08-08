"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { requirePermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { checkInVisitSchema, checkOutVisitSchema, submitSurveySchema, listVisitsQuerySchema } from "@/lib/validations/inst-sales";
import { generateConsumptionEstimate } from "@/lib/inst-sales/consumption-engine";

function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function serializeVisit<T extends Record<string, unknown>>(row: T) {
  return { ...row, checkInLat: num(row.checkInLat), checkInLng: num(row.checkInLng), checkOutLat: num(row.checkOutLat), checkOutLng: num(row.checkOutLng) };
}

function serializeSurvey<T extends Record<string, unknown>>(row: T) {
  return { ...row, totalBuiltUpAreaSqft: num(row.totalBuiltUpAreaSqft), cleaningAreaSqft: num(row.cleaningAreaSqft), outdoorAreaSqft: num(row.outdoorAreaSqft) };
}

export async function checkInVisit(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_VISITS_MANAGE);
    const data = checkInVisitSchema.parse(input);

    let customerId = data.customerId ?? null;
    if (!customerId && data.opportunityId) {
      const opportunity = await prisma.instOpportunity.findUnique({ where: { id: data.opportunityId }, select: { customerId: true } });
      customerId = opportunity?.customerId ?? null;
    }

    const visit = await prisma.instVisit.create({
      data: { ...data, customerId, officerId: principal.id, checkInAt: new Date() },
    });

    if (data.opportunityId) {
      await prisma.instOpportunity.update({ where: { id: data.opportunityId }, data: { stage: "CUSTOMER_VISIT" } }).catch(() => null);
    }
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "VISIT_CHECKED_IN", recordType: "InstVisit", recordId: visit.id });
    revalidatePath("/os/sales/visits");
    return { success: true as const, data: serializeVisit(visit) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function checkOutVisit(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_VISITS_MANAGE);
    const data = checkOutVisitSchema.parse(input);
    const existing = await prisma.instVisit.findUnique({ where: { id: data.id } });
    if (!existing) throw new NotFoundError("Visit");

    const { id, ...rest } = data;
    const updated = await prisma.instVisit.update({
      where: { id },
      data: { ...rest, checkOutAt: new Date() },
    });

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "VISIT_CHECKED_OUT", recordType: "InstVisit", recordId: id, newValue: { outcome: data.outcome } });
    revalidatePath("/os/sales/visits");
    revalidatePath(`/os/sales/visits/${id}`);
    return { success: true as const, data: serializeVisit(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listVisits(input?: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_VISITS_MANAGE);
    const query = listVisitsQuerySchema.parse(input ?? {});
    const where = {
      AND: [
        query.officerId ? { officerId: query.officerId } : principal.isFounder ? {} : { officerId: principal.id },
        query.customerId ? { customerId: query.customerId } : {},
        query.opportunityId ? { opportunityId: query.opportunityId } : {},
        query.from || query.to ? { visitDate: { gte: query.from, lte: query.to } } : {},
      ],
    };

    const [items, total] = await Promise.all([
      prisma.instVisit.findMany({
        where, orderBy: { visitDate: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { customer: { select: { name: true } }, officer: { select: { name: true } }, survey: { select: { id: true } } },
      }),
      prisma.instVisit.count({ where }),
    ]);
    return { success: true as const, data: { items: items.map(serializeVisit), total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getVisitDetail(id: string) {
  try {
    await requirePermission(PERMISSIONS.INST_VISITS_MANAGE);
    const visit = await prisma.instVisit.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, businessName: true } },
        officer: { select: { id: true, name: true } },
        opportunity: { select: { id: true, opportunityNumber: true } },
        lead: { select: { id: true, leadNumber: true, organizationName: true } },
        survey: { include: { consumptionEstimate: true } },
      },
    });
    if (!visit) throw new NotFoundError("Visit");
    return {
      success: true as const,
      data: {
        ...serializeVisit(visit),
        survey: visit.survey
          ? {
              ...serializeSurvey(visit.survey),
              consumptionEstimate: visit.survey.consumptionEstimate
                ? {
                    ...visit.survey.consumptionEstimate,
                    potentialMonthlyOpportunity: Number(visit.survey.consumptionEstimate.potentialMonthlyOpportunity),
                    potentialAnnualOpportunity: Number(visit.survey.consumptionEstimate.potentialAnnualOpportunity),
                  }
                : null,
            }
          : null,
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Module 5 (Customer Survey) + Module 6 (MUV AI Consumption Intelligence) —
 * one action, because the spec requires the AI estimate to be generated
 * "based on survey information" every time a survey is captured, not as a
 * separate manual step an officer could forget to trigger.
 */
export async function submitSurvey(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_VISITS_MANAGE);
    const data = submitSurveySchema.parse(input);
    const visit = await prisma.instVisit.findUnique({ where: { id: data.visitId } });
    if (!visit) throw new NotFoundError("Visit");

    const { visitId, ...surveyFields } = data;

    const result = await prisma.$transaction(async (tx) => {
      const survey = await tx.instSurvey.upsert({
        where: { visitId },
        create: { visitId, ...surveyFields },
        update: surveyFields,
      });

      const estimate = generateConsumptionEstimate({
        cleaningAreaSqft: survey.cleaningAreaSqft ? Number(survey.cleaningAreaSqft) : null,
        outdoorAreaSqft: survey.outdoorAreaSqft ? Number(survey.outdoorAreaSqft) : null,
        floors: survey.floors, rooms: survey.rooms, beds: survey.beds, washrooms: survey.washrooms, kitchens: survey.kitchens,
        hasLobby: survey.hasLobby, housekeepingStaff: survey.housekeepingStaff, laundryStaff: survey.laundryStaff, cleaningStaff: survey.cleaningStaff,
        laundryCapacity: survey.laundryCapacity, cleaningFrequency: survey.cleaningFrequency, monthlyConsumptionKnown: survey.monthlyConsumptionKnown,
        currentFloorCleaner: survey.currentFloorCleaner, currentDetergent: survey.currentDetergent, currentGlassCleaner: survey.currentGlassCleaner,
        currentToiletCleaner: survey.currentToiletCleaner, currentHandWash: survey.currentHandWash, currentDishwash: survey.currentDishwash,
      });

      const consumptionEstimate = await tx.instConsumptionEstimate.upsert({
        where: { surveyId: survey.id },
        create: {
          surveyId: survey.id, rulesVersion: estimate.rulesVersion, estimates: estimate.estimates as never,
          potentialMonthlyOpportunity: estimate.potentialMonthlyOpportunityInr, potentialAnnualOpportunity: estimate.potentialAnnualOpportunityInr,
          suggestedTrialQuantity: estimate.suggestedTrialQuantity as never, suggestedFirstOrder: estimate.suggestedFirstOrder as never,
          insights: estimate.insights as never, confidence: estimate.overallConfidence,
        },
        update: {
          rulesVersion: estimate.rulesVersion, estimates: estimate.estimates as never,
          potentialMonthlyOpportunity: estimate.potentialMonthlyOpportunityInr, potentialAnnualOpportunity: estimate.potentialAnnualOpportunityInr,
          suggestedTrialQuantity: estimate.suggestedTrialQuantity as never, suggestedFirstOrder: estimate.suggestedFirstOrder as never,
          insights: estimate.insights as never, confidence: estimate.overallConfidence, generatedAt: new Date(),
        },
      });

      if (visit.opportunityId) {
        await tx.instOpportunity.update({ where: { id: visit.opportunityId }, data: { stage: "REQUIREMENT_ANALYSIS" } }).catch(() => null);
      }

      return { survey, consumptionEstimate };
    });

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "SURVEY_SUBMITTED", recordType: "InstVisit", recordId: visitId, newValue: { potentialMonthlyOpportunity: Number(result.consumptionEstimate.potentialMonthlyOpportunity) } });
    revalidatePath(`/os/sales/visits/${visitId}`);
    return {
      success: true as const,
      data: {
        survey: serializeSurvey(result.survey),
        consumptionEstimate: {
          ...result.consumptionEstimate,
          potentialMonthlyOpportunity: Number(result.consumptionEstimate.potentialMonthlyOpportunity),
          potentialAnnualOpportunity: Number(result.consumptionEstimate.potentialAnnualOpportunity),
        },
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}
