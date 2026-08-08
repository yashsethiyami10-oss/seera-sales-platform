"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAnyPermission, requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { assignSegment, recalculateCustomerIntelligence } from "@/lib/growth/customer-intelligence";
import { assignMembership, createReferral, postReward, transitionReferral } from "@/lib/growth/loyalty";
import { generateExecutiveReport } from "@/lib/growth/analytics";

const id = z.string().cuid();
const actor = (principal: Awaited<ReturnType<typeof requirePermission>>) => ({ id: principal.id, email: principal.email });

export async function recalculateCustomerAction(customerId: string) {
  const principal = await requirePermission(PERMISSIONS.INTELLIGENCE_RECALCULATE);
  const result = await recalculateCustomerIntelligence(actor(principal), id.parse(customerId));
  revalidatePath("/sales/intelligence"); revalidatePath(`/sales/customers/${customerId}`); return result;
}
export async function assignCustomerSegmentAction(input: unknown) {
  const principal = await requirePermission(PERMISSIONS.SEGMENTS_MANAGE);
  const parsed = z.object({ customerId: id, segmentId: id, isPrimary: z.boolean(), reason: z.string().min(3), protected: z.boolean().optional() }).parse(input);
  const result = await assignSegment(actor(principal), parsed); revalidatePath("/sales/intelligence"); return result;
}
export async function adjustRewardAction(input: unknown) {
  const principal = await requirePermission(PERMISSIONS.LOYALTY_ADJUST_REWARDS);
  const parsed = z.object({ customerId: id, transactionTypeCode: z.string().min(2), points: z.number().int().positive(), reason: z.string().min(3), idempotencyKey: z.string().min(8).optional() }).parse(input);
  const result = await postReward(actor(principal), parsed); revalidatePath("/sales/loyalty"); return result;
}
export async function assignMembershipAction(input: unknown) {
  const principal = await requirePermission(PERMISSIONS.LOYALTY_MANAGE_MEMBERSHIP);
  const parsed = z.object({ customerId: id, levelId: id, reason: z.string().min(3) }).parse(input);
  return assignMembership(actor(principal), parsed.customerId, parsed.levelId, parsed.reason);
}
export async function createReferralAction(input: unknown) {
  const principal = await requirePermission(PERMISSIONS.LOYALTY_MANAGE_REFERRALS);
  const parsed = z.object({ referrerCustomerId: id, referredCustomerId: id }).parse(input);
  return createReferral(actor(principal), parsed.referrerCustomerId, parsed.referredCustomerId);
}
export async function transitionReferralAction(input: unknown) {
  const principal = await requirePermission(PERMISSIONS.LOYALTY_MANAGE_REFERRALS);
  const parsed = z.object({ referralId: id, targetCode: z.string(), reason: z.string().min(3) }).parse(input);
  return transitionReferral(actor(principal), parsed.referralId, parsed.targetCode, parsed.reason);
}
export async function generateExecutiveReportAction(input: unknown) {
  const principal = await requirePermission(PERMISSIONS.EXECUTIVE_REPORTS_GENERATE);
  const parsed = z.object({ templateCode: z.string(), start: z.coerce.date(), end: z.coerce.date() }).refine(v => v.start <= v.end, "Invalid date range").parse(input);
  return generateExecutiveReport(principal.id, parsed.templateCode, { start: parsed.start, end: parsed.end });
}
export async function authorizeIntelligenceExport() {
  return requireAnyPermission(PERMISSIONS.INTELLIGENCE_EXPORT);
}
