import type { Prisma } from "@prisma/client";
import { postJournalInTx } from "./journal-service";

// Spec section 57: Company Finance governs COMPANY books only — S.S.->Distributor
// and Distributor->Retailer commercial documents must never post into this GL.
// Both hooks below are gated on issuerType === "COMPANY" for exactly that reason,
// even though the existing party-ledger (SeeraFinancialEntry) they sit alongside
// posts for every issuer in the network.

// Called from lib/sales-distribution/document-service.ts's issueSystemDocument(),
// inside the same transaction, immediately after the existing SeeraFinancialEntry
// party-ledger post — never as a replacement for it. TAX_INVOICE/NON_TAX_INVOICE
// recognise revenue + output GST against Trade Receivables; CREDIT_NOTE reverses
// that recognition; DEBIT_NOTE increases it the same direction as an invoice.
export async function postJournalForCompanyDocument(
  tx: Prisma.TransactionClient,
  actorId: string,
  document: { id: string; type: string; issuerType: string; taxableTotal: number; cgstTotal: number; sgstTotal: number; igstTotal: number; grandTotal: number; issueDate: Date; documentNumber: string; idempotencyKey: string },
) {
  if (document.issuerType !== "COMPANY") return null;
  if (!["TAX_INVOICE", "NON_TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(document.type)) return null;
  const isCreditNote = document.type === "CREDIT_NOTE";
  const receivableLine = { accountId: "1100", ...(isCreditNote ? { credit: document.grandTotal } : { debit: document.grandTotal }) };
  const revenueLines = [
    { accountId: "4000", ...(isCreditNote ? { debit: document.taxableTotal } : { credit: document.taxableTotal }) },
    ...(document.cgstTotal > 0 ? [{ accountId: "2021", ...(isCreditNote ? { debit: document.cgstTotal } : { credit: document.cgstTotal }) }] : []),
    ...(document.sgstTotal > 0 ? [{ accountId: "2022", ...(isCreditNote ? { debit: document.sgstTotal } : { credit: document.sgstTotal }) }] : []),
    ...(document.igstTotal > 0 ? [{ accountId: "2023", ...(isCreditNote ? { debit: document.igstTotal } : { credit: document.igstTotal }) }] : []),
  ];
  return postJournalInTx(tx, actorId, {
    date: document.issueDate,
    sourceType: document.type === "CREDIT_NOTE" ? "SALES_CREDIT_NOTE" : document.type === "DEBIT_NOTE" ? "SALES_DEBIT_NOTE" : "SALES_INVOICE",
    sourceId: document.id,
    narration: `${document.type.replace(/_/g, " ")} ${document.documentNumber}`,
    idempotencyKey: `${document.idempotencyKey}:gl`,
    lines: [receivableLine, ...revenueLines],
  });
}

// Called from lib/sales-distribution/financial-service.ts's allocateVerifiedPayment(),
// once per allocation line, inside the same transaction. This is the "Advance
// applied: reduce customer advance, settle invoice" step from spec section 4 —
// it only fires when the invoice being settled was Company-issued; S.S./Distributor
// invoice allocations are unaffected (they have no Company GL presence to settle).
export async function postJournalForCompanyAllocation(
  tx: Prisma.TransactionClient,
  actorId: string,
  allocation: { id: string; documentId: string; amount: number; idempotencyKey: string },
) {
  const document = await tx.seeraCommercialDocument.findUnique({ where: { id: allocation.documentId } });
  if (!document || document.issuerType !== "COMPANY") return null;
  return postJournalInTx(tx, actorId, {
    date: new Date(),
    sourceType: "SALES_ADVANCE",
    sourceId: allocation.id,
    narration: `Advance applied to ${document.documentNumber}`,
    idempotencyKey: `${allocation.idempotencyKey}:gl`,
    lines: [
      { accountId: "2010", debit: allocation.amount, partyType: document.buyerType, partyId: document.buyerId },
      { accountId: "1100", credit: allocation.amount, partyType: document.buyerType, partyId: document.buyerId },
    ],
  });
}
