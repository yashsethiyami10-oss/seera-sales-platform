import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postJournal } from "../journal-service";
import { OTHER_PARTY_DIMENSION_KIND, otherPartyLedgerSummary } from "./context";

// SEERA SMART FINANCE — ADVANCE LIFECYCLE (Business Understanding Pass 2, Phase 3).
//
//   ADVANCE GIVEN            Dr 1300 Advances / Cr Cash-Bank      (EXP-ADVANCE, already built)
//        ↓
//   OUTSTANDING ADVANCE     (1300 debit balance, party-tagged via the ledger)
//        ↓
//   SETTLEMENT / RECOVERY   this file — Cr 1300 (party) against either:
//        ↓                    • RECOVERY_CASH      Dr Cash-Bank      (person returns the money)
//   OUTSTANDING REDUCED       • SETTLE_TO_EXPENSE  Dr <expense acct> (the advance is consumed —
//                                                   bills submitted, converted to a real expense)
//
// This introduces NO new accounting treatment: it is a normal balanced journal posted through the
// EXISTING governed postJournal(sourceType: "MANUAL") path — which enforces the `journal:post`
// permission, period locks, idempotency (unique idempotencyKey) and audit. The only thing new is
// that the 1300 line is party-tagged (partyType/partyId) so the Other Party ledger can attribute
// it. An advance is never over-settled: the amount is checked against the current outstanding.

export type SettleAdvanceInput = {
  dimensionId: string;
  amount: number;
  date: Date;
  reason: string;
  idempotencyKey: string;
} & (
  | { kind: "RECOVERY_CASH"; treasuryAccountId: string; treasuryAccountCoaCode: string }
  | { kind: "SETTLE_TO_EXPENSE"; expenseAccountCode: string }
);

export async function settleAdvance(db: PrismaClient, actorId: string, input: SettleAdvanceInput) {
  await authorize(db, { actorId, permission: "journal:post" });
  if (!(input.amount > 0)) throw new FoundationError("INVALID_AMOUNT", "Settlement amount must be positive", 400);

  const dimension = await db.seeraFinancialDimension.findUniqueOrThrow({ where: { id: input.dimensionId } });
  if (dimension.kind !== OTHER_PARTY_DIMENSION_KIND) throw new FoundationError("NOT_AN_OTHER_PARTY", "Advance settlement is only for an Other Party", 400);

  // Idempotency FIRST — a retry of an already-posted settlement must return the same result and must
  // NOT be re-validated against the (now already-reduced) outstanding.
  const existingJournal = await db.seeraJournalEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existingJournal) {
    const now = await otherPartyLedgerSummary(db, input.dimensionId);
    return { journalId: existingJournal.id, journalNumber: existingJournal.journalNumber, kind: input.kind, amount: input.amount, party: { id: dimension.id, name: dimension.name }, outstandingBefore: now.outstanding, outstandingAfter: now.outstanding };
  }

  const summary = await otherPartyLedgerSummary(db, input.dimensionId);
  if (summary.outstanding <= 0) throw new FoundationError("NO_OUTSTANDING_ADVANCE", `${dimension.name} has no outstanding advance to settle`, 409);
  if (Math.round(input.amount * 100) > Math.round(summary.outstanding * 100))
    throw new FoundationError("SETTLEMENT_EXCEEDS_OUTSTANDING", `Settlement ${input.amount} exceeds the outstanding advance ${summary.outstanding}`, 400);

  const creditLine = { accountId: "1300", credit: input.amount, partyType: OTHER_PARTY_DIMENSION_KIND, partyId: input.dimensionId, description: input.reason };
  const debitLine =
    input.kind === "RECOVERY_CASH"
      ? { accountId: input.treasuryAccountCoaCode, debit: input.amount, treasuryAccountId: input.treasuryAccountId, description: `Advance recovered from ${dimension.name}` }
      : { accountId: input.expenseAccountCode, debit: input.amount, description: `Advance to ${dimension.name} settled against expense` };

  const journal = await postJournal(db, actorId, {
    date: input.date,
    sourceType: "MANUAL",
    narration:
      input.kind === "RECOVERY_CASH"
        ? `Advance recovery — ${dimension.name} — ${input.reason}`
        : `Advance settlement — ${dimension.name} — ${input.reason}`,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    lines: [debitLine, creditLine],
  });

  const after = await otherPartyLedgerSummary(db, input.dimensionId);
  return {
    journalId: journal.id,
    journalNumber: journal.journalNumber,
    kind: input.kind,
    amount: input.amount,
    party: { id: dimension.id, name: dimension.name },
    outstandingBefore: summary.outstanding,
    outstandingAfter: after.outstanding,
  };
}
