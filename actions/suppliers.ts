"use server";

import { createVendor, listVendors, transitionVendor } from "@/lib/enterprise/vendor-service";
import { toErrorResponse } from "@/lib/errors";

/**
 * MUV OS™ — Milestone 2 (Customer & Master Data Foundation), Supplier
 * Master.
 *
 * Deliberately thin: this codebase already has a complete, production
 * Vendor Management system (`EnterpriseVendor` + contacts + documents +
 * agreements + performance tracking, wired into Accounts Payable) under
 * `lib/enterprise/vendor-service.ts`. "Supplier" and "Vendor" are the same
 * business concept — building a second, parallel Supplier table would
 * duplicate that system, exactly what this milestone's own rules forbid.
 * These functions exist only to give MUV OS's own UI Supplier-named entry
 * points; all real logic (validation, numbering, status transitions,
 * audit, feature-flag gating) stays in vendor-service.ts, unchanged.
 *
 * Because they call `requireEnterprisePrincipal`, these correctly inherit
 * the existing `ENTERPRISE_OPERATIONS_ENABLED`/`ENTERPRISE_VENDOR_ENABLED`
 * feature-flag gate — both seeded off by default. That is not a bug in
 * this wrapper; it is this codebase's existing, deliberate rollout gate
 * for the whole Enterprise Operations module, and this milestone does not
 * change that decision.
 *
 * Refinement pass — `EnterpriseVendor.minimumOrderValue` is a Prisma
 * `Decimal`, the same non-serializable-across-Server/Client-boundary class
 * found and fixed for `Customer.creditLimit` and `TaxConfiguration.rate`.
 * `createSupplier`/`setSupplierStatus` are called directly from Client
 * Components (`SupplierForm`), so this is a real instance of the same bug,
 * not just a defensive fix. Serialized here, at this wrapper layer — not
 * in `lib/enterprise/vendor-service.ts` itself, which is existing,
 * out-of-scope Enterprise Operations code this milestone doesn't touch.
 */
function serializeVendor<T extends { minimumOrderValue: unknown }>(row: T): Omit<T, "minimumOrderValue"> & { minimumOrderValue: number | null } {
  return { ...row, minimumOrderValue: row.minimumOrderValue ? Number(row.minimumOrderValue) : null };
}

export async function createSupplier(input: unknown) {
  try {
    const result = await createVendor(input);
    return { success: true as const, data: serializeVendor(result.entity) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listSuppliers(input: { q?: string; status?: string; page?: number; pageSize?: number }) {
  try {
    const result = await listVendors(input);
    return { success: true as const, data: { ...result, items: result.items.map(serializeVendor) } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function setSupplierStatus(id: string, targetStatus: string, version: number, reason?: string) {
  try {
    const result = await transitionVendor(id, targetStatus, version, reason);
    return { success: true as const, data: serializeVendor(result.entity) };
  } catch (err) {
    return toErrorResponse(err);
  }
}
