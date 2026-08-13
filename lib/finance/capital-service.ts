import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postJournal } from "./journal-service";

// Spec section 36/11: Founder Capital and Drawings must never be classified
// as revenue/expense — they post straight to Equity, tagged partyType
// "FOUNDER" so the Founder Capital Ledger (capitalLedger below) can filter
// the GL to just these two account codes without a parallel table.
export async function recordCapitalIntroduced(db: PrismaClient, actorId: string, input: { amount: number; date: Date; treasuryAccountId: string; treasuryAccountCoaCode: string; description?: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "money_in:record" });
  if (input.amount <= 0) throw new FoundationError("INVALID_AMOUNT", "Amount must be positive", 400);
  return postJournal(db, actorId, {
    date: input.date,
    sourceType: "CAPITAL_INTRODUCED",
    narration: input.description ?? "Founder capital introduced",
    idempotencyKey: input.idempotencyKey,
    lines: [
      { accountId: input.treasuryAccountCoaCode, debit: input.amount, treasuryAccountId: input.treasuryAccountId },
      { accountId: "3000", credit: input.amount, partyType: "FOUNDER" },
    ],
  });
}

export async function recordDrawings(db: PrismaClient, actorId: string, input: { amount: number; date: Date; treasuryAccountId: string; treasuryAccountCoaCode: string; description?: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "money_out:record" });
  if (input.amount <= 0) throw new FoundationError("INVALID_AMOUNT", "Amount must be positive", 400);
  return postJournal(db, actorId, {
    date: input.date,
    sourceType: "DRAWINGS",
    narration: input.description ?? "Founder drawings",
    idempotencyKey: input.idempotencyKey,
    lines: [
      { accountId: "3010", debit: input.amount, partyType: "FOUNDER" },
      { accountId: input.treasuryAccountCoaCode, credit: input.amount, treasuryAccountId: input.treasuryAccountId },
    ],
  });
}

export async function capitalLedger(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const lines = await db.seeraJournalLine.findMany({ where: { accountId: { in: ["3000", "3010"] }, journal: { status: "POSTED" } }, include: { journal: true }, orderBy: { journal: { date: "asc" } } });
  const introduced = lines.filter((l) => l.accountId === "3000").reduce((s, l) => s + Number(l.credit), 0);
  const drawn = lines.filter((l) => l.accountId === "3010").reduce((s, l) => s + Number(l.debit), 0);
  return { entries: lines.map((l) => ({ date: l.journal.date, accountId: l.accountId, amount: l.accountId === "3000" ? Number(l.credit) : Number(l.debit), narration: l.journal.narration, journalId: l.journal.id })), totalIntroduced: introduced, totalDrawn: drawn, netCapital: introduced - drawn };
}
