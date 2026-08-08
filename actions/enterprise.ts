"use server";

import { revalidatePath } from "next/cache";
import { toErrorResponse } from "@/lib/errors";
import { createVendor, transitionVendor } from "@/lib/enterprise/vendor-service";
import { createPurchaseRequisition, submitPurchaseRequisition } from "@/lib/enterprise/procurement-service";
import { createFormula, createProductionOrder, createBatch, recordQualityDecision, transitionFormulaRevision, transitionProductionOrder } from "@/lib/enterprise/operations-services";
import { createWarehouseMovement } from "@/lib/enterprise/warehouse-service";
import { generatePlanningSnapshot } from "@/lib/enterprise/planning-reporting";

async function run<T>(operation: () => Promise<T>) {
  try {
    const data = await operation();
    revalidatePath("/enterprise");
    return { success: true as const, data };
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const createEnterpriseVendor = (input: unknown) => run(() => createVendor(input));
export const transitionEnterpriseVendor = (id: string, status: string, version: number, reason?: string) => run(() => transitionVendor(id, status, version, reason));
export const createEnterpriseRequisition = (input: unknown) => run(() => createPurchaseRequisition(input));
export const submitEnterpriseRequisition = (id: string, version: number) => run(() => submitPurchaseRequisition(id, version));
export const createEnterpriseFormula = (input: unknown) => run(() => createFormula(input));
export const transitionEnterpriseFormula = (id: string, status: Parameters<typeof transitionFormulaRevision>[1], version: number) => run(() => transitionFormulaRevision(id, status, version));
export const createEnterpriseProductionOrder = (input: unknown) => run(() => createProductionOrder(input));
export const transitionEnterpriseProductionOrder = (id: string, status: string, version: number, reason?: string) => run(() => transitionProductionOrder(id, status, version, reason));
export const createEnterpriseBatch = (input: Parameters<typeof createBatch>[0]) => run(() => createBatch(input));
export const decideEnterpriseQuality = (input: Parameters<typeof recordQualityDecision>[0]) => run(() => recordQualityDecision(input));
export const moveEnterpriseStock = (input: unknown) => run(() => createWarehouseMovement(input));
export const refreshEnterprisePlan = () => run(() => generatePlanningSnapshot());

