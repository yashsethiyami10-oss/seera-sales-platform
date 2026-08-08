import type { PrismaClient } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { requireVersion, type EnterpriseTx } from "@/lib/enterprise/context";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal } from "./context";
import { wouldCreateHierarchyCycle } from "./domain";
import { costCenterInput, profitCenterInput } from "./schemas";

/**
 * Enterprise Finance Platform (Part 3C, Wave 1) — cost centers and profit
 * centers share an identical shape and rule set, so both are implemented
 * once against a Prisma delegate parameter rather than duplicating the same
 * service twice. The database-level organization/self-parent guards added
 * in this Wave's migration apply identically to both tables.
 */

type DimensionDelegate = PrismaClient["financeCostCenter"] | PrismaClient["financeProfitCenter"];
type DimensionRow = { id: string; organizationKey: string; code: string; parentId: string | null; status: string; version: number };

function delegateFor(tx: EnterpriseTx, kind: "COST_CENTER" | "PROFIT_CENTER"): DimensionDelegate {
  return (kind === "COST_CENTER" ? tx.financeCostCenter : tx.financeProfitCenter) as unknown as DimensionDelegate;
}

// The two Prisma delegates are structurally identical but not the same
// nominal type, so calls through the shared `delegate` variable below are
// cast rather than fought with generics — the two exported wrapper
// functions per operation keep the public API fully typed either way.

async function createDimension(kind: "COST_CENTER" | "PROFIT_CENTER", input: unknown) {
  const data = (kind === "COST_CENTER" ? costCenterInput : profitCenterInput).parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  if (data.effectiveTo && data.effectiveTo <= data.effectiveFrom) throw new AppError("effectiveTo must be after effectiveFrom", 422, "INVALID_RANGE");

  return enterpriseTransaction(async (tx) => {
    const delegate = delegateFor(tx, kind);
    if (data.parentId) {
      const parent = await (delegate as any).findFirst({ where: { id: data.parentId, organizationKey: principal.organizationKey } }) as DimensionRow | null;
      if (!parent) throw new AppError("Parent must belong to the same organization", 422, "INVALID_PARENT");
    }
    const created = await (delegate as any).create({
      data: { ...data, organizationKey: principal.organizationKey, createdById: principal.id },
    }) as DimensionRow;
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: `${kind}_CREATED`, entityType: kind === "COST_CENTER" ? "FinanceCostCenter" : "FinanceProfitCenter",
      entityId: created.id, description: `${kind === "COST_CENTER" ? "Cost" : "Profit"} center ${created.code} created`,
      next: { code: created.code },
    });
    return created;
  });
}

async function reparentDimension(kind: "COST_CENTER" | "PROFIT_CENTER", id: string, expectedVersion: number, parentId: string | null) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  if (parentId === id) throw new AppError("A dimension cannot be its own parent", 422, "SELF_PARENT");

  return enterpriseTransaction(async (tx) => {
    const delegate = delegateFor(tx, kind);
    const current = await (delegate as any).findFirst({ where: { id, organizationKey: principal.organizationKey } }) as DimensionRow | null;
    if (!current) throw new NotFoundError(kind === "COST_CENTER" ? "Cost center" : "Profit center");
    requireVersion(current.version, expectedVersion);

    if (parentId) {
      const parent = await (delegate as any).findFirst({ where: { id: parentId, organizationKey: principal.organizationKey } }) as DimensionRow | null;
      if (!parent) throw new AppError("Parent must belong to the same organization", 422, "INVALID_PARENT");
      const findChildren = async (nodeId: string) => {
        const children = await (delegate as any).findMany({ where: { organizationKey: principal.organizationKey, parentId: nodeId }, select: { id: true } }) as Array<{ id: string }>;
        return children.map((row) => row.id);
      };
      if (await wouldCreateHierarchyCycle(findChildren, parentId, id)) throw new ConflictError("This would create a hierarchy cycle");
    }

    const updated = await (delegate as any).update({ where: { id: current.id }, data: { parentId, version: { increment: 1 } } }) as DimensionRow;
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: `${kind}_REPARENTED`, entityType: kind === "COST_CENTER" ? "FinanceCostCenter" : "FinanceProfitCenter",
      entityId: updated.id, description: `${kind === "COST_CENTER" ? "Cost" : "Profit"} center ${updated.code} reparented`,
      previous: { parentId: current.parentId }, next: { parentId: updated.parentId },
    });
    return updated;
  });
}

async function setDimensionStatus(kind: "COST_CENTER" | "PROFIT_CENTER", id: string, expectedVersion: number, status: "ACTIVE" | "INACTIVE") {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const delegate = delegateFor(tx, kind);
    const current = await (delegate as any).findFirst({ where: { id, organizationKey: principal.organizationKey } }) as DimensionRow | null;
    if (!current) throw new NotFoundError(kind === "COST_CENTER" ? "Cost center" : "Profit center");
    requireVersion(current.version, expectedVersion);
    if (current.status === status) throw new ConflictError(`Already ${status.toLowerCase()}`);

    const updated = await (delegate as any).update({ where: { id: current.id }, data: { status, version: { increment: 1 } } }) as DimensionRow;
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: `${kind}_${status}`, entityType: kind === "COST_CENTER" ? "FinanceCostCenter" : "FinanceProfitCenter",
      entityId: updated.id, description: `${kind === "COST_CENTER" ? "Cost" : "Profit"} center ${updated.code}: ${current.status} to ${status}`,
      previous: { status: current.status }, next: { status: updated.status },
    });
    return updated;
  });
}

async function listDimensions(kind: "COST_CENTER" | "PROFIT_CENTER", status?: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const delegate = delegateFor(tx, kind);
    return (delegate as any).findMany({
      where: { organizationKey: principal.organizationKey, status },
      orderBy: [{ code: "asc" }],
      take: 5000, // bounded — Section 37 "no unbounded exports/queries"
    });
  });
}

export const createCostCenter = (input: unknown) => createDimension("COST_CENTER", input);
export const reparentCostCenter = (id: string, expectedVersion: number, parentId: string | null) => reparentDimension("COST_CENTER", id, expectedVersion, parentId);
export const setCostCenterStatus = (id: string, expectedVersion: number, status: "ACTIVE" | "INACTIVE") => setDimensionStatus("COST_CENTER", id, expectedVersion, status);
export const listCostCenters = (status?: string) => listDimensions("COST_CENTER", status);

export const createProfitCenter = (input: unknown) => createDimension("PROFIT_CENTER", input);
export const reparentProfitCenter = (id: string, expectedVersion: number, parentId: string | null) => reparentDimension("PROFIT_CENTER", id, expectedVersion, parentId);
export const setProfitCenterStatus = (id: string, expectedVersion: number, status: "ACTIVE" | "INACTIVE") => setDimensionStatus("PROFIT_CENTER", id, expectedVersion, status);
export const listProfitCenters = (status?: string) => listDimensions("PROFIT_CENTER", status);
