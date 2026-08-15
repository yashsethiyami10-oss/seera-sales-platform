import { Prisma, type PrismaClient } from "@prisma/client";
import { FoundationError } from "@/lib/foundation/errors";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { listMaterials, lowStockMaterials, nearExpiryMaterials } from "./material-service";
import { listLocations } from "./material-service";
import { listBoms } from "./bom-service";
import { listSops } from "./sop-service";
import { listPackagingBoms } from "./packaging-bom-service";
import { listProductionPlans } from "./production-planning-service";
import { listProductionOrders } from "./production-order-service";
import { qcQueue } from "./qc-service";
import { listGrns, grnPendingQc } from "./grn-service";
import { listStockCounts } from "./stores-service";
import { listDeviations } from "./deviation-service";
import { wastageReport } from "./wastage-service";
import { getCompanyInventoryModeGated, cogsCoverageReport } from "./company-stock-service";

export type ManufacturingRoleView = "FULL" | "STORE" | "QC" | "OPERATOR";

// Determines which top-level workspace shell renders (closure spec §5/6/7:
// "genuinely simplified" Operator/Store/QC UIs, not just hidden buttons on
// the full one). Checked most-privileged-first so Founder/Manager/Supervisor
// (who hold mfg_order:manage or mfg_settings:manage or mfg_bom:manage) always
// land on the full command-and-control nav; the three narrow single-purpose
// roles get their own minimal shell. Purely a rendering decision — every
// underlying action is still independently authorize()'d server-side
// regardless of which shell requested it.
async function manufacturingRoleView(db: PrismaClient, actorId: string): Promise<ManufacturingRoleView> {
  const permissions = await effectivePermissions(db, actorId);
  if (permissions.has("system:super_admin") || permissions.has("mfg_settings:manage") || permissions.has("mfg_bom:manage") || permissions.has("mfg_order:manage")) return "FULL";
  if (permissions.has("mfg_qc:release")) return "QC";
  if (permissions.has("mfg_grn:manage") || permissions.has("mfg_stock_count:manage")) return "STORE";
  if (permissions.has("mfg_batch:execute")) return "OPERATOR";
  return "FULL";
}

async function tryOrNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof FoundationError && error.status === 403) return null;
    throw error;
  }
}

// This object crosses the Server -> Client Component boundary as a prop into
// <ManufacturingWorkspacePanel> — same Decimal-serialization requirement as
// Finance OS's founder-workspace-data.ts (see that file's comment for the
// full explanation). Recursively converts every Prisma.Decimal to a plain
// number once, here, rather than hand-fixing each source function.
function serializeDecimals<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toNumber() as unknown as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => serializeDecimals(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serializeDecimals(v);
    return out as T;
  }
  return value;
}

// One query wave for the whole Manufacturing workspace, mirroring the
// Finance OS founder-workspace-data.ts pattern: each underlying call still
// enforces its own authorize(); a section a role lacks permission for comes
// back null and its UI section hides rather than the whole page erroring —
// this is what lets Founder/Manager/Supervisor/Store/QC/Operator share one
// workspace component safely.
export async function manufacturingWorkspaceData(db: PrismaClient, actorId: string) {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86_400_000);
  const [roleView, materials, rawMaterials, packagingMaterials, locations, lowStock, nearExpiry, boms, sops, packagingBoms, plans, orders, qc, grns, grnQc, stockCounts, deviations, wastage, companyInventoryMode, cogsCoverage] = await Promise.all([
    manufacturingRoleView(db, actorId),
    tryOrNull(() => listMaterials(db, actorId)),
    tryOrNull(() => listMaterials(db, actorId, "RAW_MATERIAL")),
    tryOrNull(() => listMaterials(db, actorId, "PACKAGING_MATERIAL")),
    tryOrNull(() => listLocations(db, actorId)),
    tryOrNull(() => lowStockMaterials(db, actorId)),
    tryOrNull(() => nearExpiryMaterials(db, actorId, 30)),
    tryOrNull(() => listBoms(db, actorId)),
    tryOrNull(() => listSops(db, actorId)),
    tryOrNull(() => listPackagingBoms(db, actorId)),
    tryOrNull(() => listProductionPlans(db, actorId)),
    tryOrNull(() => listProductionOrders(db, actorId)),
    tryOrNull(() => qcQueue(db, actorId)),
    tryOrNull(() => listGrns(db, actorId)),
    tryOrNull(() => grnPendingQc(db, actorId)),
    tryOrNull(() => listStockCounts(db, actorId)),
    tryOrNull(() => listDeviations(db, actorId, "OPEN")),
    tryOrNull(() => wastageReport(db, actorId, { from, to: now })),
    tryOrNull(() => getCompanyInventoryModeGated(db, actorId)),
    tryOrNull(() => cogsCoverageReport(db, actorId, { from, to: now })),
  ]);
  return serializeDecimals({ roleView, materials, rawMaterials, packagingMaterials, locations, lowStock, nearExpiry, boms, sops, packagingBoms, plans, orders, qc, grns, grnQc, stockCounts, deviations, wastage, companyInventoryMode, cogsCoverage });
}

export type ManufacturingWorkspaceData = Awaited<ReturnType<typeof manufacturingWorkspaceData>>;
