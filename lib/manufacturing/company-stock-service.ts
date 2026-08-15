import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { inventoryPosition } from "@/lib/sales-distribution/business-rules";
import { postJournalInTx } from "@/lib/finance/journal-service";
import { updateSetting } from "@/lib/foundation/configuration-service";

export type CompanyInventoryMode = "LEGACY_UNBOUNDED" | "MANUFACTURING_GOVERNED";
const SETTING_KEY = "manufacturing.company_inventory_mode";

// Governed compatibility switch (spec §11) — Sales V1 historically treated
// Company as an infinite-supply root (see workflow-service.ts's own comment
// on dispatchCompanyOrder). This setting is the ONLY thing that changes that,
// and only when a Founder/Admin explicitly flips it — never a heuristic based
// on row counts or auto-detection. Reuses the existing governed
// updateSetting()/PHASE_1_SETTING_KEYS allowlist (already Founder/Admin-only
// via settings:manage) rather than inventing a parallel settings mechanism.
export async function getCompanyInventoryMode(db: PrismaClient | Prisma.TransactionClient): Promise<CompanyInventoryMode> {
  const setting = await db.appSetting.findUnique({ where: { key: SETTING_KEY } });
  return setting?.value === "MANUFACTURING_GOVERNED" ? "MANUFACTURING_GOVERNED" : "LEGACY_UNBOUNDED";
}

export async function setCompanyInventoryMode(db: PrismaClient, actorId: string, mode: CompanyInventoryMode, reason: string) {
  return updateSetting(db, actorId, { key: SETTING_KEY, category: "manufacturing", valueType: "STRING", value: mode, reason });
}

// Founder/Admin-only visibility of the mode itself (not just the ability to
// change it) — reuses the same settings:manage gate updateSetting() enforces,
// so the toggle only ever renders for the roles that can also flip it.
export async function getCompanyInventoryModeGated(db: PrismaClient, actorId: string): Promise<CompanyInventoryMode> {
  await authorize(db, { actorId, permission: "settings:manage" });
  return getCompanyInventoryMode(db);
}

export async function companyStockPosition(db: PrismaClient | Prisma.TransactionClient, skuId: string) {
  const movements = await db.seeraInventoryMovement.findMany({ where: { partyType: "COMPANY", skuId }, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }] });
  const position = inventoryPosition(movements.map((m) => ({ direction: m.direction, quantity: Number(m.quantity) })));
  return { onHand: position.onHand, reserved: position.reserved, available: position.onHand - position.reserved };
}

type DispatchLine = { skuId: string; quantity: number };

// Called BEFORE any dispatch mutation happens (fail fast, no partial state —
// spec §9.3). Returns the mode so the caller only invokes the mutation half
// below when governed, and never re-derives the mode a second time (avoids
// any TOCTOU window between the check and the write within one transaction).
export async function assertCompanyDispatchAvailable(tx: Prisma.TransactionClient, lines: DispatchLine[]): Promise<CompanyInventoryMode> {
  const mode = await getCompanyInventoryMode(tx);
  if (mode !== "MANUFACTURING_GOVERNED") return mode;
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const position = await companyStockPosition(tx, line.skuId);
    if (position.available < line.quantity) throw new FoundationError("INSUFFICIENT_COMPANY_STOCK", `Company stock for this SKU is insufficient for dispatch — required ${line.quantity}, available ${position.available}`, 409, { skuId: line.skuId, required: line.quantity, available: position.available });
  }
  return mode;
}

// The smallest authoritative integration (spec §10): posts the real OUT +
// attempts a batch/lot-allocated COGS recognition. Only called once
// assertCompanyDispatchAvailable has already confirmed MANUFACTURING_GOVERNED
// mode and sufficient stock — a LEGACY_UNBOUNDED deployment never reaches
// this function, so behavior there is unchanged, byte for byte.
export async function postCompanyDispatchStockAndCogs(tx: Prisma.TransactionClient, actorId: string, input: { orderId: string; deliveryId: string; idempotencyKey: string; lines: DispatchLine[] }) {
  const results: { skuId: string; dispatched: number; costConfidence: string }[] = [];
  for (const line of input.lines) {
    if (line.quantity <= 0) continue;
    await tx.seeraInventoryMovement.create({
      data: { partyType: "COMPANY", partyId: "SEERA_COMPANY", skuId: line.skuId, type: "DISPATCH", direction: "OUT", quantity: line.quantity, sourceType: "SeeraDelivery", sourceId: input.deliveryId, actorId, sourcePortal: "manufacturing", reason: "Company order dispatch — governed stock mode", idempotencyKey: `${input.idempotencyKey}:company-out:${line.skuId}` },
    });

    // FIFO batch/lot allocation against RELEASED finished-goods receipts
    // (spec §15) — "remaining" per receipt is always derived from its
    // existing allocations, never a separately-stored counter.
    const receipts = await tx.seeraFinishedGoodsReceipt.findMany({ where: { productSkuId: line.skuId, qcStatus: "RELEASED" }, orderBy: { createdAt: "asc" } });
    let remainingToAllocate = line.quantity;
    let coveredQuantity = 0;
    let coveredValue = 0;
    for (const receipt of receipts) {
      if (remainingToAllocate <= 0) break;
      const existingAllocations = await tx.seeraCompanyDispatchAllocation.aggregate({ where: { receiptId: receipt.id }, _sum: { quantity: true } });
      const receiptRemaining = Number(receipt.quantity) - Number(existingAllocations._sum.quantity ?? 0);
      if (receiptRemaining <= 0) continue;
      const take = Math.min(receiptRemaining, remainingToAllocate);
      const batchCost = await tx.seeraBatchCost.findUnique({ where: { batchId: receipt.batchId } });
      const unitCost = batchCost?.unitCost != null ? Number(batchCost.unitCost) : null;
      await tx.seeraCompanyDispatchAllocation.create({
        data: { orderId: input.orderId, deliveryId: input.deliveryId, skuId: line.skuId, receiptId: receipt.id, batchId: receipt.batchId, quantity: take, unitCost, costConfidence: batchCost?.confidence ?? "UNAVAILABLE", idempotencyKey: `${input.idempotencyKey}:alloc:${line.skuId}:${receipt.id}` },
      });
      remainingToAllocate -= take;
      if (unitCost != null) { coveredQuantity += take; coveredValue += take * unitCost; }
    }
    const confidence = coveredQuantity === 0 ? "UNAVAILABLE" : coveredQuantity < line.quantity ? "PARTIAL" : "RELIABLE";
    results.push({ skuId: line.skuId, dispatched: line.quantity, costConfidence: confidence });

    // COGS recognition — only for the portion with a real cost basis; never
    // fabricated for the uncovered remainder (spec §14: "do NOT fabricate
    // COGS... return COST_BASIS_REQUIRED"). Idempotent via postJournalInTx's
    // own idempotencyKey check.
    if (coveredValue > 0) {
      await postJournalInTx(tx, actorId, {
        date: new Date(),
        sourceType: "COGS_RECOGNITION",
        sourceId: input.deliveryId,
        narration: `COGS recognized — Company dispatch (${confidence === "RELIABLE" ? "full" : "partial"} cost coverage)`,
        idempotencyKey: `${input.idempotencyKey}:cogs:${line.skuId}`,
        lines: [
          { accountId: "5001", debit: coveredValue },
          { accountId: "1230", credit: coveredValue },
        ],
      });
    }
    await recordAudit(tx, { actorId, action: "mfg.company_dispatch.stock_and_cogs", entityType: "SeeraInventoryMovement", entityId: input.deliveryId, afterState: { skuId: line.skuId, dispatched: line.quantity, costConfidence: confidence, coveredValue } });
  }
  return { lines: results };
}

export async function cogsCoverageReport(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const allocations = await db.seeraCompanyDispatchAllocation.findMany({ where: { createdAt: { gte: input.from, lte: input.to } } });
  const total = allocations.reduce((s, a) => s + Number(a.quantity), 0);
  const reliable = allocations.filter((a) => a.costConfidence === "RELIABLE").reduce((s, a) => s + Number(a.quantity), 0);
  const coveragePct = total > 0 ? Math.round((reliable / total) * 10000) / 100 : 0;
  return { total, reliable, coveragePct, exceptions: allocations.filter((a) => a.costConfidence !== "RELIABLE").length };
}
