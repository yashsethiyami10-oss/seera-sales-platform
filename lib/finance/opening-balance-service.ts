import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postJournal, postJournalInTx } from "./journal-service";

// Opening Balance Wizard (spec section 40) — ONE balanced journal covering
// however many Bank/Cash/Receivables/Payables/Loans/Capital/Advances/Other
// lines the Founder enters together at go-live, dated on the chosen
// effective date. Deliberately does not require historical transaction
// reconstruction — it is the single carry-forward entry.
export async function postOpeningBalances(
  db: PrismaClient,
  actorId: string,
  input: { effectiveDate: Date; lines: { accountId: string; debit?: number; credit?: number; description?: string; treasuryAccountId?: string; partyType?: string; partyId?: string }[]; idempotencyKey: string },
) {
  await authorize(db, { actorId, permission: "journal:post" });
  const alreadyPosted = await db.seeraJournalEntry.findFirst({ where: { sourceType: "OPENING_BALANCE", status: "POSTED" } });
  if (alreadyPosted) throw new FoundationError("OPENING_BALANCES_ALREADY_POSTED", "Opening balances were already posted — use a manual journal or reversal for corrections", 409);

  return db.$transaction(async (tx) => {
    const journal = await postJournalInTx(tx, actorId, { date: input.effectiveDate, sourceType: "OPENING_BALANCE", narration: "Opening balances", idempotencyKey: input.idempotencyKey, lines: input.lines });
    await recordAudit(tx, { actorId, action: "finance.opening_balances.posted", entityType: "SeeraJournalEntry", entityId: journal.id, afterState: { lines: input.lines.length, effectiveDate: input.effectiveDate } });
    return { journal };
  });
}

export async function openingBalanceStatus(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const journal = await db.seeraJournalEntry.findFirst({ where: { sourceType: "OPENING_BALANCE", status: "POSTED" }, include: { lines: true } });
  return { posted: Boolean(journal), journal };
}
