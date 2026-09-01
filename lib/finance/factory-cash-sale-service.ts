import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// Section-14 (production closure pass): Retail/Factory Cash Sale is a distinct, minimal governed
// sales-event type - NOT a SeeraSalesOrder (that model assumes SKU/line-item granularity a cash
// sale doesn't need - see the schema model's own comment) and NOT a Money Desk/ledger transaction
// (no unnecessary ledger requirement, per the Founder's explicit rule). It reuses money_desk:create
// as its authorization gate rather than a new permission code - that permission is already held by
// exactly the Founder/Accounts roles who'd realistically record this, and adding a dedicated
// permission would need its own seed/migration for no real gain in correctness.
export async function createFactoryCashSale(
  db: PrismaClient,
  actorId: string,
  input: { saleDate: Date; partyName?: string; amount: number; notes?: string },
) {
  await authorize(db, { actorId, permission: "money_desk:create" });
  if (!(input.amount > 0)) throw new FoundationError("INVALID_AMOUNT", "Amount must be greater than ₹0", 400);
  const sale = await db.seeraFactoryCashSale.create({
    data: {
      saleDate: input.saleDate,
      partyName: input.partyName?.trim() || undefined,
      amount: input.amount,
      notes: input.notes?.trim() || undefined,
      createdById: actorId,
    },
  });
  await recordAudit(db, {
    actorId,
    action: "factory_cash_sale.recorded",
    entityType: "SeeraFactoryCashSale",
    entityId: sale.id,
    afterState: { saleDate: sale.saleDate.toISOString(), partyName: sale.partyName, amount: sale.amount.toString() },
  });
  return sale;
}

// Read model for Founder Sales Overview / Analytics (Section 13/16) - a plain date-range sum, kept
// separate from any SeeraSalesOrder aggregation rather than force-merged into it, since the two are
// deliberately different event shapes read side by side, not the same table.
export async function factoryCashSalesForPeriod(db: PrismaClient, actorId: string, from: Date, to: Date) {
  await authorize(db, { actorId, permission: "money_desk:view" });
  const rows = await db.seeraFactoryCashSale.findMany({
    where: { saleDate: { gte: from, lt: to } },
    orderBy: { saleDate: "desc" },
  });
  return {
    rows,
    count: rows.length,
    total: rows.reduce((sum, r) => sum + Number(r.amount), 0),
  };
}
