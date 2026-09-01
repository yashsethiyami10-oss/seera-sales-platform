import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";

// SEERA SMART FINANCE — BUSINESS CONTEXT LAYER. Read-only. Turns the raw finance masters into the
// contextual picture the Founder actually needs to make a decision: what each Treasury account is,
// its real ledger balance and recent activity, and whether a named person is a known employee, a
// previously-confirmed "Other Party", or genuinely unknown. It NEVER fabricates a balance and
// NEVER creates a record — every number here is computed from POSTED journal lines the exact same
// way moneyDeskHome computes "Today's Cash / Bank", so the two screens can never disagree.

export const OTHER_PARTY_DIMENSION_KIND = "OTHER_PARTY";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export type TreasuryRecentEntry = { date: Date; description: string; amount: number; direction: "IN" | "OUT" };
export type TreasuryContextAccount = {
  id: string;
  name: string;
  displayName: string; // "HDFC Bank ****1234" / "Cash — Main Office"
  kind: "BANK" | "CASH";
  bankName: string | null;
  maskedAccountNumber: string | null;
  coaCode: string;
  isActive: boolean;
  /** POSTED-journal movement only (debit − credit), same basis as moneyDeskHome. Never invented. */
  balance: number;
  /** Configured opening balance — informational only; its accounting effect, if any, is already a journal. */
  openingBalance: number;
  lastEntryAt: Date | null;
  recentEntries: TreasuryRecentEntry[];
  selectable: boolean;
};

export type TreasuryContext = {
  accounts: TreasuryContextAccount[];
  activeCount: number;
  cashCount: number;
  bankCount: number;
  emptyState: { title: string; message: string; actionLabel: string; actionSlug: string } | null;
};

export async function treasuryContext(db: PrismaClient, actorId: string): Promise<TreasuryContext> {
  await authorize(db, { actorId, permission: "money_desk:view" });

  const accounts = await db.seeraTreasuryAccount.findMany({
    orderBy: [{ isActive: "desc" }, { kind: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, bankName: true, maskedAccountNumber: true, chartOfAccountId: true, openingBalance: true, isActive: true },
  });

  const coaCodeById = new Map(
    (await db.seeraChartOfAccount.findMany({ where: { id: { in: accounts.map((a) => a.chartOfAccountId) } }, select: { id: true, code: true } })).map((c) => [c.id, c.code]),
  );

  // One grouped aggregate for every account's lifetime POSTED movement — identical query shape to
  // moneyDeskHome's `allTimeLines`.
  const movement = await db.seeraJournalLine.groupBy({
    by: ["treasuryAccountId"],
    where: { treasuryAccountId: { in: accounts.map((a) => a.id) }, journal: { status: "POSTED" } },
    _sum: { debit: true, credit: true },
    _max: { id: true },
  });
  const balanceById = new Map(movement.map((m) => [m.treasuryAccountId, Number(m._sum.debit ?? 0) - Number(m._sum.credit ?? 0)]));

  // Recent 3 entries per account (small N accounts → a bounded per-account query is fine and keeps
  // this readable; every entry is a real POSTED journal line).
  const recentByAccount = new Map<string, TreasuryRecentEntry[]>();
  const lastAtByAccount = new Map<string, Date | null>();
  for (const account of accounts) {
    const lines = await db.seeraJournalLine.findMany({
      where: { treasuryAccountId: account.id, journal: { status: "POSTED" } },
      orderBy: { journal: { date: "desc" } },
      take: 3,
      select: { debit: true, credit: true, description: true, journal: { select: { date: true, narration: true } } },
    });
    recentByAccount.set(
      account.id,
      lines.map((l) => {
        const debit = Number(l.debit);
        const credit = Number(l.credit);
        return {
          date: l.journal.date,
          description: l.description ?? l.journal.narration,
          amount: Math.abs(debit - credit),
          direction: debit >= credit ? ("IN" as const) : ("OUT" as const),
        };
      }),
    );
    lastAtByAccount.set(account.id, lines[0]?.journal.date ?? null);
  }

  const contextAccounts: TreasuryContextAccount[] = accounts.map((a) => {
    const masked = a.maskedAccountNumber ? `****${a.maskedAccountNumber.replace(/\D/g, "").slice(-4)}` : null;
    const displayName =
      a.kind === "BANK"
        ? [a.bankName ?? a.name, masked].filter(Boolean).join(" ")
        : a.name;
    return {
      id: a.id,
      name: a.name,
      displayName,
      kind: a.kind,
      bankName: a.bankName,
      maskedAccountNumber: masked,
      coaCode: coaCodeById.get(a.chartOfAccountId) ?? "",
      isActive: a.isActive,
      balance: balanceById.get(a.id) ?? 0,
      openingBalance: Number(a.openingBalance),
      lastEntryAt: lastAtByAccount.get(a.id) ?? null,
      recentEntries: recentByAccount.get(a.id) ?? [],
      selectable: a.isActive,
    };
  });

  const active = contextAccounts.filter((a) => a.isActive);
  const emptyState =
    active.length === 0
      ? {
          title: "No Treasury account configured yet",
          message:
            "Smart Finance needs at least one active Cash or Bank account to record where money came from or went. Add one in Finance → Treasury, then try again.",
          actionLabel: "Configure Treasury",
          actionSlug: "finance-os",
        }
      : null;

  return {
    accounts: contextAccounts,
    activeCount: active.length,
    cashCount: active.filter((a) => a.kind === "CASH").length,
    bankCount: active.filter((a) => a.kind === "BANK").length,
    emptyState,
  };
}

export function summariseTreasuryForDisplay(a: Pick<TreasuryContextAccount, "displayName" | "kind" | "balance" | "lastEntryAt">): string {
  const parts = [`${a.displayName} (${a.kind})`, `bal ${inr(a.balance)}`];
  if (a.lastEntryAt) parts.push(`last ${a.lastEntryAt.toISOString().slice(0, 10)}`);
  return parts.join(" · ");
}

// ── People: employee vs previously-confirmed Other Party vs unknown ──────────────────────────────
export type OtherPartyMatch = { id: string; name: string };
export async function resolveOtherParty(
  db: PrismaClient,
  nameQuery: string,
): Promise<{ matched: OtherPartyMatch | null; candidates: OtherPartyMatch[]; notFound: boolean }> {
  const q = norm(nameQuery);
  if (q.length < 2) return { matched: null, candidates: [], notFound: false };
  const rows = await db.seeraFinancialDimension.findMany({
    where: { kind: OTHER_PARTY_DIMENSION_KIND, isActive: true },
    select: { id: true, name: true },
    take: 500,
  });
  const hits = rows.filter((r) => {
    const n = norm(r.name);
    if (n === q || n.includes(q) || q.includes(n)) return true;
    // Word-level match — "Ramesh 3af9" resolves "Ramesh Kumar 3af9" (same convention as the
    // employee/vendor matcher in service.ts).
    const qWords = q.split(" ").filter((w) => w.length >= 3);
    return qWords.length > 0 && qWords.every((w) => n.includes(w));
  });
  if (hits.length === 1) return { matched: hits[0]!, candidates: [], notFound: false };
  if (hits.length > 1) return { matched: null, candidates: hits.slice(0, 8), notFound: false };
  return { matched: null, candidates: [], notFound: true };
}

// ── Other Party position (Business Understanding Pass 2, Phase 2) ───────────────────────────────
// Real, posted-data-only running position of an Other Party. Full per-row statement lives in
// party-ledger-service.ts (otherPartyLedger) so it shares the one Professional Ledger engine; this
// is the lightweight calc the Smart Finance review card and the advance over-settle guard use.
//   • ADVANCES    — SeeraExpense (payeeType = OTHER_PARTY, entryType ADVANCE): Dr 1300 / Cr Cash.
//   • SETTLEMENTS — party-tagged SeeraJournalLine on account 1300 (posted by settleAdvance): Cr 1300.
// The advance's own journal line is NOT party-tagged, so the two feeds never double-count.
// Outstanding = advances − settlements. Nothing posted ⇒ everything 0 (no fabricated balance).
export const OTHER_PARTY_ADVANCE_ACCOUNT = "1300";

export async function otherPartyLedgerSummary(
  db: PrismaClient,
  dimensionId: string,
): Promise<{ count: number; netPaid: number; outstanding: number; lastDate: Date | null }> {
  const advances = await db.seeraExpense.aggregate({
    where: { payeeType: OTHER_PARTY_DIMENSION_KIND, payeeId: dimensionId, status: "POSTED" },
    _sum: { amount: true },
    _count: true,
    _max: { date: true },
  });
  const settlements = await db.seeraJournalLine.aggregate({
    where: { partyType: OTHER_PARTY_DIMENSION_KIND, partyId: dimensionId, accountId: OTHER_PARTY_ADVANCE_ACCOUNT, journal: { status: "POSTED" } },
    _sum: { credit: true, debit: true },
  });
  const totalAdvances = Number(advances._sum.amount ?? 0);
  const settled = Number(settlements._sum.credit ?? 0) - Number(settlements._sum.debit ?? 0);
  return {
    count: advances._count,
    netPaid: totalAdvances,
    outstanding: Math.round((totalAdvances - settled) * 100) / 100,
    lastDate: advances._max.date ?? null,
  };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, " ").replace(/\s+/g, " ").trim();
}

// ── Manufacturing → Finance context (Business Understanding Pass 2, Phase 6) ────────────────────
// READ-ONLY resolver so Smart Finance can attach manufacturing-linked financial events to the RIGHT
// real entity. It never posts and never duplicates manufacturing accounting — the existing chain
// (grn-service.postGrn, costing-service.postCogsForBatch / postWastageExpense,
// company-stock-service.postCompanyDispatchStockAndCogs) stays the single source of truth. For
// money-out events this maps straight onto the EXISTING Money Desk purposes:
//   raw material purchase → PUR-RM (createGrn + createVendorBill)
//   machine repair / maintenance / factory expense → EXP-* quick-entry categories
//     (QE-MACHINE-REPAIR / QE-MAINTENANCE / QE-FACTORY-EXPENSE, all FACTORY parentGroup)
// This resolver just names the material / location / recent batch the sentence refers to.
export async function manufacturingFinanceContext(
  db: PrismaClient,
  actorId: string,
  query: string,
): Promise<{
  materials: { id: string; code: string; name: string; type: string; baseUnit: string }[];
  locations: { id: string; code: string; name: string }[];
  recentBatches: { id: string; batchNumber: string; date: string; productSkuId: string }[];
}> {
  await authorize(db, { actorId, permission: "money_desk:view" });
  const q = norm(query);
  const qWords = q.split(" ").filter((w) => w.length >= 2);
  const nameMatch = (name: string) => {
    const n = norm(name);
    return qWords.length > 0 && (n.includes(q) || q.includes(n) || qWords.every((w) => n.includes(w)));
  };
  const [materials, locations, batches] = await Promise.all([
    db.seeraManufacturingMaterial.findMany({ select: { id: true, code: true, name: true, type: true, baseUnit: true }, take: 500 }),
    db.seeraManufacturingLocation.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, take: 200 }),
    db.seeraProductionBatch.findMany({ orderBy: { date: "desc" }, take: 20, select: { id: true, batchNumber: true, date: true, productSkuId: true } }),
  ]);
  return {
    materials: (q.length >= 2 ? materials.filter((m) => nameMatch(m.name) || norm(m.code) === q) : []).slice(0, 10).map((m) => ({ ...m, type: String(m.type), baseUnit: String(m.baseUnit) })),
    locations: (q.length >= 2 ? locations.filter((l) => nameMatch(l.name) || norm(l.code) === q) : []).slice(0, 10),
    recentBatches: batches
      .filter((b) => (q.length >= 2 ? norm(b.batchNumber).includes(q) : true))
      .slice(0, 5)
      .map((b) => ({ id: b.id, batchNumber: b.batchNumber, date: b.date.toISOString(), productSkuId: b.productSkuId })),
  };
}

// ── Product / SKU resolution (Business Understanding Pass 2, Phase 5) ───────────────────────────
// Resolves a product phrase against the REAL SeeraSku master. Exact code match → resolve; name
// word-match → resolve if unique, else return candidates; nothing → notFound (never fabricate a
// SKU, a rate or a tax rate — spec §5). Rate defaults to the SKU's own MRP (the natural price for a
// counter / walk-in cash sale); the caller can override on the review card.
export type SkuMatch = {
  id: string;
  code: string;
  productName: string;
  category: string;
  unitType: string;
  packSize: number;
  unitsPerCase: number;
  mrp: number;
  taxRatePct: number | null;
  hsn: string | null;
};
export async function resolveSku(
  db: PrismaClient,
  actorId: string,
  productText: string,
): Promise<{ matched: SkuMatch | null; candidates: SkuMatch[]; notFound: boolean }> {
  await authorize(db, { actorId, permission: "money_desk:view" });
  const q = norm(productText);
  if (q.length < 2) return { matched: null, candidates: [], notFound: false };
  const rows = await db.seeraSku.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, productName: true, category: true, unitType: true, packSize: true, unitsPerCase: true, mrp: true, taxRate: true, hsn: true },
    take: 1000,
  });
  const toMatch = (r: (typeof rows)[number]): SkuMatch => ({
    id: r.id,
    code: r.code,
    productName: r.productName,
    category: r.category,
    unitType: r.unitType,
    packSize: Number(r.packSize),
    unitsPerCase: r.unitsPerCase,
    mrp: Number(r.mrp),
    taxRatePct: r.taxRate != null ? Number(r.taxRate) : null,
    hsn: r.hsn,
  });
  const qWords = q.split(" ").filter((w) => w.length >= 2);
  const hits = rows.filter((r) => {
    if (norm(r.code) === q) return true;
    const n = norm(r.productName);
    if (n === q || n.includes(q)) return true;
    return qWords.length > 0 && qWords.every((w) => n.includes(w));
  });
  if (hits.length === 1) return { matched: toMatch(hits[0]!), candidates: [], notFound: false };
  if (hits.length > 1) return { matched: null, candidates: hits.slice(0, 10).map(toMatch), notFound: false };
  return { matched: null, candidates: [], notFound: true };
}
