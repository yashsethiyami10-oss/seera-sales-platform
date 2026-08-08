"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { quotationScope } from "@/lib/quotation/repository";
import { opportunityScope } from "@/lib/opportunity/repository";
import { createQuotation, createRevision, decideApproval, registerDocument, replaceDraftLines, requestApproval, transitionQuotation } from "@/lib/quotation/workflow";

const cuid = z.string().cuid();
const lineSchema = z.object({ productId: cuid, variantId: cuid.nullish(), quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative().optional(), discountType: z.enum(["PERCENTAGE","FIXED"]).optional(),
  discountValue: z.coerce.number().nonnegative().optional(), discountReason: z.string().max(500).optional(),
  taxCode: z.string().max(60).optional(), displayOrder: z.coerce.number().int().nonnegative().optional() });

async function scopedVersion(versionId: string) {
  return prisma.quotationVersion.findFirstOrThrow({ where: { id: versionId, quotation: await quotationScope() }, select: { id: true } });
}
export async function createQuotationAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.QUOTATIONS_CREATE_VERSIONS);
    const data = z.object({ opportunityId: cuid, pricingPolicyCode: z.string().max(50), validUntil: z.coerce.date(),
      terms: z.record(z.string().max(5000)).optional(), lines: z.array(lineSchema).min(1).max(100) }).parse(input);
    // FR-008 — reuse the exact same opportunityScope() helper the /sales/quotations/new
    // selector query uses, instead of a separately-hand-rolled ownerUserId-only check.
    // The prior check only matched Founder (bypass) or the opportunity's direct owner,
    // which rejected valid submissions from a Sales Manager (whose scope also includes
    // direct reports' and territory opportunities) and an Institutional Sales Officer
    // (whose scope requires customerType too) even when the selector correctly showed
    // them that same opportunity — a real scope mismatch between what a role could see
    // and what it could submit. One authoritative helper now backs both.
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { id: data.opportunityId, AND: await opportunityScope() } });
    void opportunity;
    const result = await createQuotation(actor, data); revalidatePath("/sales/quotations"); revalidatePath(`/sales/opportunities/${data.opportunityId}`);
    return { success: true as const, data: { id: result.quotation.id, versionId: result.version.id, quotationNumber: result.quotation.quotationNumber } };
  } catch (error) { return toErrorResponse(error); }
}
export async function updateQuotationLinesAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.QUOTATIONS_UPDATE);
    const data = z.object({ versionId: cuid, lines: z.array(lineSchema).min(1).max(100) }).parse(input);
    await scopedVersion(data.versionId); await replaceDraftLines(actor, data.versionId, data.lines);
    revalidatePath("/sales/quotations"); return { success: true as const };
  } catch (error) { return toErrorResponse(error); }
}
export async function transitionQuotationAction(input: unknown) {
  try {
    const data = z.object({ versionId: cuid, targetCode: z.string().max(50), reason: z.string().max(1000).optional() }).parse(input);
    const permission = data.targetCode === "SENT" ? PERMISSIONS.QUOTATIONS_SEND : data.targetCode === "ACCEPTED" || data.targetCode === "REJECTED" ? PERMISSIONS.QUOTATIONS_RESPOND : PERMISSIONS.QUOTATIONS_UPDATE;
    const actor = await requirePermission(permission); await scopedVersion(data.versionId);
    await transitionQuotation(actor, data); revalidatePath("/sales/quotations"); return { success: true as const };
  } catch (error) { return toErrorResponse(error); }
}
export async function requestQuotationApprovalAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.QUOTATIONS_UPDATE);
    const data = z.object({ versionId: cuid, ruleCode: z.string().max(50), approverId: cuid.optional() }).parse(input);
    await scopedVersion(data.versionId); await requestApproval(actor, data.versionId, data.ruleCode, data.approverId);
    revalidatePath("/sales/quotations"); return { success: true as const };
  } catch (error) { return toErrorResponse(error); }
}
export async function decideQuotationApprovalAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.QUOTATIONS_APPROVE);
    const data = z.object({ requestId: cuid, decision: z.enum(["APPROVED","REJECTED","REVISION_REQUESTED"]), reason: z.string().max(1000).optional() }).parse(input);
    const request = await prisma.quotationApprovalRequest.findFirstOrThrow({ where: { id: data.requestId, quotationVersion: { quotation: await quotationScope() } } });
    void request; await decideApproval(actor, data.requestId, data.decision, data.reason); revalidatePath("/sales/quotations");
    return { success: true as const };
  } catch (error) { return toErrorResponse(error); }
}
export async function createQuotationRevisionAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.QUOTATIONS_REVISE);
    const data = z.object({ versionId: cuid, reason: z.string().min(3).max(1000) }).parse(input);
    await scopedVersion(data.versionId); const version = await createRevision(actor, data.versionId, data.reason);
    revalidatePath("/sales/quotations"); return { success: true as const, data: { versionId: version.id } };
  } catch (error) { return toErrorResponse(error); }
}
export async function registerQuotationPdfAction(input: unknown) {
  try {
    const actor = await requirePermission(PERMISSIONS.QUOTATIONS_PDF);
    const data = z.object({ versionId: cuid, fileReference: z.string().min(3).max(1000), sizeBytes: z.coerce.number().int().positive().max(20*1024*1024) }).parse(input);
    await scopedVersion(data.versionId); const document = await registerDocument(actor, data.versionId, data.fileReference, data.sizeBytes);
    return { success: true as const, data: { id: document.id } };
  } catch (error) { return toErrorResponse(error); }
}
