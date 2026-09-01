import type { PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { purposeDefinition, type MoneyDeskDirection } from "../money-desk-registry";
import { deriveCostCentre } from "../cost-centre";
import { searchEmployees } from "../quick-entry-service";
import { parseSmartFinance, type ParsedSmartFinance, type PartyTypeHint, type TreasuryHint } from "./parser";
import { resolveOtherParty, otherPartyLedgerSummary, treasuryContext, resolveSku, type TreasuryContextAccount, type SkuMatch } from "./context";
import { buildOtherPartyProposal, type OtherPartyProposal } from "./other-party";

// SEERA SMART FINANCE — GOVERNED INTERPRETATION SERVICE. The bridge between the pure NL parser and
// the EXISTING Money Desk. It (1) parses, (2) re-resolves every hint against real, permission-scoped
// master data — treasury accounts WITH their real ledger balance + recent activity, vendors,
// distributors/S.S., employees, previously-confirmed "Other Parties", expense categories,
// territories — (3) explains WHY each field resolved the way it did, (4) computes confidence + the
// still-unresolved fields, and (5) returns a ready-to-submit payload for the EXISTING governed
// endpoint. It NEVER posts, NEVER fabricates a balance, and NEVER invents a party (spec §21).

export type SmartConfidence = "HIGH" | "MEDIUM" | "LOW";

export type PartyCandidate = { id: string; name: string; type: PartyTypeHint; territoryId?: string | null };

export type SmartTreasuryOption = {
  id: string;
  name: string;
  displayName: string;
  kind: "BANK" | "CASH";
  coaCode: string;
  balance: number;
  maskedAccountNumber: string | null;
  lastEntryAt: string | null;
  recentEntries: { date: string; description: string; amount: number; direction: "IN" | "OUT" }[];
  selectable: boolean;
};

export type PersonRole = "EMPLOYEE" | "OTHER_PARTY" | "UNRESOLVED";
export type PersonResolution = {
  subjectText: string;
  role: PersonRole;
  status: "MATCHED" | "AMBIGUOUS" | "UNMATCHED";
  employee?: { id: string; name: string };
  otherParty?: { id: string; name: string };
  candidates?: { id: string; name: string; role: "EMPLOYEE" | "OTHER_PARTY" }[];
  proposal?: OtherPartyProposal;
  priorActivity?: { count: number; netPaid: number; lastDate: string | null };
  explanation: string;
};

export type SmartExplanations = Partial<Record<"amount" | "category" | "direction" | "treasury" | "party" | "person" | "territory" | "product", string>>;

export type SkuLine = {
  status: "MATCHED" | "AMBIGUOUS" | "UNKNOWN";
  sku: SkuMatch | null;
  candidates: SkuMatch[];
  quantity: number | null;
  unitOfMeasure: string | null;
  rate: number | null;
  taxRatePct: number | null;
  lineTotal: number | null;
  explanation: string;
  missing: string[];
};

export type SmartFinanceDraft = {
  originalText: string;
  parsed: ParsedSmartFinance;
  confidence: SmartConfidence;
  understood: boolean;
  postAction: "money-desk-create" | "guided-receipt" | "settle-advance" | null;
  /** Set only when postAction === "settle-advance". */
  settlePayload: Record<string, unknown> | null;

  direction: "MONEY_IN" | "MONEY_OUT" | null;
  moneyDeskDirection: MoneyDeskDirection | null;
  purposeCode: string | null;
  purposeLabel: string | null;
  purposeHindiLabel: string | null;
  intentLabel: string | null;
  /** The real ledger account this category posts to (SeeraChartOfAccount, via SeeraExpenseCategory) — null when the purpose has no fixed quick-entry category account (routes through a different domain service). */
  categoryAccount: { code: string; name: string; type: string } | null;

  amount: number | null;
  date: string;

  paymentMode: "CASH" | "BANK" | "UPI";
  treasury: { id: string; name: string; kind: string; coaCode: string } | null;
  treasuryAssumed: boolean;
  treasuryOptions: SmartTreasuryOption[];
  treasuryEmptyState: { title: string; message: string; actionLabel: string; actionSlug: string } | null;

  party: PartyCandidate | null;
  partyType: PartyTypeHint | null;
  partyText: string | null;
  partyCandidates: PartyCandidate[];
  partyNotFound: boolean;

  employee: { id: string; name: string } | null;
  personResolution: PersonResolution | null;
  skuLine: SkuLine | null;

  territory: { id: string; name: string } | null;
  territorySource: "distributor" | "employee-auto" | null;
  costCentre: string | null;

  explanations: SmartExplanations;
  purposeNote: string | null;
  missingRequired: string[];
  notes: string[];

  createPayload: Record<string, unknown> | null;
};

const PERSON_PURPOSES = new Set(["SAL-EMP", "EXP-ADVANCE", "EXP-REIMBURSEMENT"]);
const INTENT_LABEL: Record<string, string> = {
  "SAL-EMP": "Salary payment",
  "EXP-ADVANCE": "Advance to a person",
  "EXP-REIMBURSEMENT": "Employee reimbursement",
  "REC-INS": "Money received",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, " ").replace(/\s+/g, " ").trim();
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function nameMatches(candidateName: string, query: string): boolean {
  const c = norm(candidateName);
  const q = norm(query);
  if (!c || !q) return false;
  if (c.includes(q) || q.includes(c)) return true;
  const qWords = q.split(" ").filter((w) => w.length >= 3);
  return qWords.length > 0 && qWords.every((w) => c.includes(w));
}

export function resolveTreasuryFromContext(
  accounts: TreasuryContextAccount[],
  hint: TreasuryHint | null,
): { treasury: SmartFinanceDraft["treasury"]; assumed: boolean; options: SmartTreasuryOption[]; paymentMode: "CASH" | "BANK" | "UPI"; explanation: string | null } {
  const active = accounts.filter((a) => a.selectable);
  const toOption = (a: TreasuryContextAccount): SmartTreasuryOption => ({
    id: a.id,
    name: a.name,
    displayName: a.displayName,
    kind: a.kind,
    coaCode: a.coaCode,
    balance: a.balance,
    maskedAccountNumber: a.maskedAccountNumber,
    lastEntryAt: a.lastEntryAt ? a.lastEntryAt.toISOString() : null,
    recentEntries: a.recentEntries.map((e) => ({ date: e.date.toISOString(), description: e.description, amount: e.amount, direction: e.direction })),
    selectable: a.selectable,
  });
  const allOptions = active.map(toOption);
  const paymentMode: "CASH" | "BANK" | "UPI" = hint?.kind === "CASH" ? "CASH" : hint?.kind === "UPI" ? "UPI" : "BANK";
  const asTreasury = (o: SmartTreasuryOption) => ({ id: o.id, name: o.name, kind: o.kind, coaCode: o.coaCode });

  if (!hint) {
    return { treasury: null, assumed: false, options: allOptions, paymentMode, explanation: allOptions.length ? "You didn't say which account — pick the one this money moved through." : null };
  }

  if (hint.kind === "CASH") {
    const cash = active.filter((a) => a.kind === "CASH");
    if (cash.length === 1) return { treasury: asTreasury(toOption(cash[0]!)), assumed: false, options: allOptions, paymentMode, explanation: `Matched "cash" to the only active Cash account (${cash[0]!.displayName}).` };
    if (cash.length > 1) return { treasury: null, assumed: false, options: cash.map(toOption), paymentMode, explanation: `You have ${cash.length} Cash accounts — choose which one.` };
    return { treasury: null, assumed: false, options: allOptions, paymentMode, explanation: "No active Cash account exists — choose an account or configure Cash." };
  }

  const banks = active.filter((a) => a.kind === "BANK");
  if (hint.bankKeyword) {
    const named = banks.filter((b) => norm(b.displayName).includes(norm(hint.bankKeyword!)) || norm(b.name).includes(norm(hint.bankKeyword!)) || (b.bankName && norm(b.bankName).includes(norm(hint.bankKeyword!))));
    if (named.length === 1) return { treasury: asTreasury(toOption(named[0]!)), assumed: false, options: allOptions, paymentMode, explanation: `Matched "${hint.bankKeyword.toUpperCase()}" to ${named[0]!.displayName}.` };
    if (named.length > 1) return { treasury: null, assumed: false, options: named.map(toOption), paymentMode, explanation: `${named.length} accounts match "${hint.bankKeyword}" — choose one.` };
    return { treasury: null, assumed: false, options: (banks.length ? banks : active).map(toOption), paymentMode, explanation: `No treasury account matches "${hint.bankKeyword}" — pick the correct one (nothing was auto-selected).` };
  }
  if (banks.length === 1) return { treasury: asTreasury(toOption(banks[0]!)), assumed: true, options: allOptions, paymentMode, explanation: `Assumed ${banks[0]!.displayName} — the only active Bank account. Please confirm.` };
  return { treasury: null, assumed: false, options: (banks.length ? banks : active).map(toOption), paymentMode, explanation: banks.length ? `You have ${banks.length} Bank accounts — choose which one.` : "No active Bank account — choose an account." };
}

async function resolveParty(
  db: PrismaClient,
  actorId: string,
  permissions: Set<string>,
  hint: PartyTypeHint | null,
  partyText: string | null,
  notes: string[],
): Promise<{ party: PartyCandidate | null; candidates: PartyCandidate[]; notFound: boolean }> {
  if (!partyText || partyText.length < 2) return { party: null, candidates: [], notFound: false };
  const isAdmin = permissions.has("system:super_admin");

  const collect = (rows: PartyCandidate[]): { party: PartyCandidate | null; candidates: PartyCandidate[]; notFound: boolean } => {
    const hits = rows.filter((r) => nameMatches(r.name, partyText));
    if (hits.length === 1) return { party: hits[0]!, candidates: [], notFound: false };
    if (hits.length > 1) return { party: null, candidates: hits.slice(0, 8), notFound: false };
    return { party: null, candidates: [], notFound: true };
  };

  try {
    if (hint === "VENDOR") {
      const vendors = await db.seeraVendor.findMany({ where: { isActive: true }, select: { id: true, legalName: true, tradeName: true }, take: 500 });
      return collect(vendors.map((v) => ({ id: v.id, name: v.tradeName ?? v.legalName, type: "VENDOR" as const })));
    }
    if (hint === "DISTRIBUTOR" || hint === "SUPER_STOCKIST") {
      if (!isAdmin && !permissions.has("finance_dashboard:view")) {
        notes.push("Distributor / S.S. lookup needs Finance oversight permission — party left blank for you to pick.");
        return { party: null, candidates: [], notFound: false };
      }
      const partners = await db.seeraPartner.findMany({ where: { type: hint }, select: { id: true, legalName: true, tradeName: true, territoryIds: true }, take: 500 });
      return collect(partners.map((p) => ({ id: p.id, name: p.tradeName ?? p.legalName, type: hint, territoryId: p.territoryIds[0] ?? null })));
    }
    if (hint === "EMPLOYEE") {
      const employees = await searchEmployees(db, actorId, partyText);
      return collect(employees.map((e) => ({ id: e.id, name: e.name ?? e.email, type: "EMPLOYEE" as const })));
    }
  } catch {
    notes.push("Could not search that master with your permissions — party left blank for you to pick.");
    return { party: null, candidates: [], notFound: false };
  }
  return { party: null, candidates: [], notFound: false };
}

// Employee → previously-confirmed Other Party → unknown (offer to add). Spec §4/§7.
async function resolvePerson(db: PrismaClient, actorId: string, subjectText: string, purposeText: string | null, notes: string[]): Promise<PersonResolution> {
  let employees: { id: string; name: string | null; email: string }[] = [];
  try {
    employees = await searchEmployees(db, actorId, subjectText);
  } catch {
    notes.push("Employee directory lookup needs expense:create permission.");
  }
  const empHits = employees.filter((e) => nameMatches(e.name ?? e.email, subjectText));
  if (empHits.length === 1) {
    const e = empHits[0]!;
    return { subjectText, role: "EMPLOYEE", status: "MATCHED", employee: { id: e.id, name: e.name ?? e.email }, explanation: `“${e.name ?? e.email}” — matched in the employee directory.` };
  }
  if (empHits.length > 1) {
    return {
      subjectText,
      role: "EMPLOYEE",
      status: "AMBIGUOUS",
      candidates: empHits.slice(0, 8).map((e) => ({ id: e.id, name: e.name ?? e.email, role: "EMPLOYEE" as const })),
      explanation: `${empHits.length} employees match “${subjectText}” — choose the right one.`,
    };
  }

  const other = await resolveOtherParty(db, subjectText);
  if (other.matched) {
    const prior = await otherPartyLedgerSummary(db, other.matched.id);
    return {
      subjectText,
      role: "OTHER_PARTY",
      status: "MATCHED",
      otherParty: other.matched,
      priorActivity: { count: prior.count, netPaid: prior.netPaid, lastDate: prior.lastDate ? prior.lastDate.toISOString() : null },
      explanation:
        prior.count > 0
          ? `“${other.matched.name}” — previously confirmed as an Other Party; ${prior.count} prior entr${prior.count === 1 ? "y" : "ies"} totalling ${inr(prior.netPaid)}.`
          : `“${other.matched.name}” — previously confirmed as an Other Party (no posted entries yet).`,
    };
  }
  if (other.candidates.length > 0) {
    return {
      subjectText,
      role: "OTHER_PARTY",
      status: "AMBIGUOUS",
      candidates: other.candidates.map((c) => ({ id: c.id, name: c.name, role: "OTHER_PARTY" as const })),
      explanation: `${other.candidates.length} Other Party records match “${subjectText}” — choose one.`,
    };
  }
  return {
    subjectText,
    role: "UNRESOLVED",
    status: "UNMATCHED",
    proposal: buildOtherPartyProposal(subjectText, purposeText),
    explanation: `“${subjectText}” is not a known employee or party. Add them once as an Other Party (this does not make them an employee) and future entries will resolve automatically.`,
  };
}

export async function interpretSmartFinance(
  db: PrismaClient,
  actorId: string,
  input: { text: string; today?: Date },
): Promise<SmartFinanceDraft> {
  await authorize(db, { actorId, permission: "money_desk:create" });
  const permissions = await effectivePermissions(db, actorId);
  const text = input.text.trim();
  if (text.length < 2) throw new FoundationError("SMART_FINANCE_EMPTY", "Type or say what happened", 400);

  const today = input.today ?? new Date();
  const parsed = parseSmartFinance(text, today);
  const notes: string[] = [...parsed.warnings];
  const explanations: SmartExplanations = {};

  const date = parsed.date ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const def = parsed.purposeCode ? safePurpose(parsed.purposeCode) : null;
  const purposeLabel = def?.label ?? parsed.purposeLabel;
  const purposeHindiLabel = def?.hindiLabel ?? null;

  // The REAL ledger account this category posts to — read from the same DB row
  // expense-service.ts's own postExpense() debits (SeeraExpenseCategory.chartOfAccountId →
  // SeeraChartOfAccount). Never a second/derived mapping: if this category has no
  // quickEntryCategoryCode (some purposes route through a different domain service entirely,
  // e.g. RAW_MATERIAL_PURCHASE), categoryAccount stays null rather than guessing — the review
  // card's "what will happen" section simply omits that line for those purposes.
  let categoryAccount: { code: string; name: string; type: string } | null = null;
  if (def?.quickEntryCategoryCode) {
    const cat = await db.seeraExpenseCategory.findFirst({ where: { code: def.quickEntryCategoryCode }, select: { chartOfAccountId: true } });
    if (cat) {
      const coa = await db.seeraChartOfAccount.findUnique({ where: { id: cat.chartOfAccountId }, select: { code: true, name: true, type: true } });
      if (coa) categoryAccount = { code: coa.code, name: coa.name, type: coa.type };
    }
  }
  const isSettlement = parsed.advanceSettlement != null;
  const intentLabel = isSettlement
    ? parsed.advanceSettlement === "RECOVERY"
      ? "Advance recovered (cash back)"
      : "Advance settled (against expense)"
    : parsed.purposeCode
      ? INTENT_LABEL[parsed.purposeCode] ?? purposeLabel
      : null;
  if (isSettlement) explanations.category = `“${parsed.advanceSettlement === "RECOVERY" ? "wapas / recover" : "settle / adjust"}” — this reduces an existing advance, it is not a new payment.`;

  if (parsed.amount != null && parsed.amountText) explanations.amount = `Read “${parsed.amountText}” as ${inr(parsed.amount)}.`;
  if (parsed.categoryKeyword) explanations.category = `Matched from “${parsed.categoryKeyword}”.`;
  else if (parsed.purposeCode === "REC-INS") explanations.category = `Money-in with no specific category — recorded as a Receipt.`;
  if (parsed.direction && parsed.directionInferred) explanations.direction = `No “paid/received” word — an expense category means Money Out.`;

  // Treasury — with real balances + recent activity.
  const tContext = await treasuryContext(db, actorId);
  const { treasury, assumed, options, paymentMode, explanation: treasuryExplanation } = resolveTreasuryFromContext(tContext.accounts, parsed.treasuryHint);
  if (treasuryExplanation) explanations.treasury = treasuryExplanation;

  // Person (employee / Other Party / unknown) OR business party (vendor / distributor / S.S.).
  // A bare name with no business-party keyword ("vendor" / "distributor" / "super stockist") is
  // treated as a PERSON, not silently dropped — this is what lets "2000 diesel Ramesh ko cash se
  // diya" resolve Ramesh the same way "3000 Ramesh ko advance diya" already did, instead of only
  // the three hardcoded person-purposes triggering resolution (Founder requirement: unknown/
  // unassigned person must fall back to Other Person, never be silently discarded).
  const involvesPerson =
    isSettlement ||
    (parsed.purposeCode != null && PERSON_PURPOSES.has(parsed.purposeCode)) ||
    parsed.partyTypeHint === "EMPLOYEE" ||
    (parsed.partyTypeHint == null && !!parsed.partyText);
  let party: PartyCandidate | null = null;
  let partyCandidates: PartyCandidate[] = [];
  let partyNotFound = false;
  let employee: { id: string; name: string } | null = null;
  let personResolution: PersonResolution | null = null;

  if (involvesPerson && parsed.partyText) {
    personResolution = await resolvePerson(db, actorId, parsed.partyText, parsed.purposeText, notes);
    explanations.person = personResolution.explanation;
    if (personResolution.role === "EMPLOYEE" && personResolution.status === "MATCHED" && personResolution.employee) {
      employee = personResolution.employee;
    }
  } else if (parsed.partyText) {
    const r = await resolveParty(db, actorId, permissions, parsed.partyTypeHint, parsed.partyText, notes);
    party = r.party;
    partyCandidates = r.candidates;
    partyNotFound = r.notFound;
    if (party?.type === "EMPLOYEE") employee = { id: party.id, name: party.name };
    if (party) explanations.party = `Matched “${parsed.partyText}” to ${party.name}${party.type ? ` (${party.type})` : ""}.`;
    else if (partyNotFound) explanations.party = `No ${parsed.partyTypeHint ?? "party"} matches “${parsed.partyText}” — nothing was auto-selected.`;
    else if (partyCandidates.length) explanations.party = `${partyCandidates.length} matches for “${parsed.partyText}” — choose one.`;
  }

  const otherPartyResolved = personResolution?.role === "OTHER_PARTY" && personResolution.status === "MATCHED" ? personResolution.otherParty ?? null : null;

  // Product / SKU line (Phase 5) — resolution only. Posting a product sale still goes through the
  // Sales walk-in order path (SALE-OFF → placeRetailerOrder), which needs a retailer record +
  // retailer:order; that wiring is a follow-up. This builds the structured, master-resolved line.
  let skuLine: SkuLine | null = null;
  if (parsed.productText) {
    const r = await resolveSku(db, actorId, parsed.productText);
    const skuMissing: string[] = [];
    if (parsed.quantity == null) skuMissing.push("quantity");
    let rate: number | null = null;
    let taxRatePct: number | null = null;
    if (r.matched) {
      rate = r.matched.mrp || null;
      taxRatePct = r.matched.taxRatePct;
      if (rate == null) skuMissing.push("rate");
      if (taxRatePct == null) skuMissing.push("tax");
    } else {
      skuMissing.push("product");
    }
    const qty = parsed.quantity;
    const lineTotal = r.matched && qty != null && rate != null ? Math.round(qty * rate * 100) / 100 : null;
    const status: SkuLine["status"] = r.matched ? "MATCHED" : r.candidates.length ? "AMBIGUOUS" : "UNKNOWN";
    const explanation = r.matched
      ? `Matched “${parsed.productText}” to ${r.matched.code} (${r.matched.productName}); rate defaulted to its MRP ${inr(r.matched.mrp)}.`
      : r.candidates.length
        ? `${r.candidates.length} products match “${parsed.productText}” — choose one.`
        : `No active product matches “${parsed.productText}” — nothing was assumed.`;
    explanations.product = explanation;
    skuLine = { status, sku: r.matched, candidates: r.candidates, quantity: qty, unitOfMeasure: parsed.unitOfMeasure, rate, taxRatePct, lineTotal, explanation, missing: skuMissing };
  }

  // Territory / cost centre (display only; the governed handler re-derives on post).
  let territory: { id: string; name: string } | null = null;
  let territorySource: SmartFinanceDraft["territorySource"] = null;
  if ((party?.type === "DISTRIBUTOR" || party?.type === "SUPER_STOCKIST") && party.territoryId) {
    const node = await db.seeraGeographyNode.findUnique({ where: { id: party.territoryId }, select: { id: true, name: true } });
    if (node) {
      territory = node;
      territorySource = "distributor";
      explanations.territory = `From ${party.name}'s configured territory.`;
    }
  } else if (employee) {
    territorySource = "employee-auto";
    explanations.territory = `Auto-derives from ${employee.name}'s territory assignment on post.`;
  }

  let costCentre: string | null = null;
  if (!territory && def?.quickEntryCategoryCode) {
    const cat = await db.seeraExpenseCategory.findFirst({ where: { code: def.quickEntryCategoryCode }, select: { chartOfAccountId: true, parentGroup: true } });
    costCentre = deriveCostCentre(cat ?? null, false);
  } else if (!territory && parsed.direction === "MONEY_OUT") {
    costCentre = "Corporate";
  }

  // For an advance settlement the resolved Other Party must have outstanding to settle.
  let outstandingAdvance: number | null = null;
  if (isSettlement && otherPartyResolved) {
    const summary = await otherPartyLedgerSummary(db, otherPartyResolved.id);
    outstandingAdvance = summary.outstanding;
    explanations.person = `${otherPartyResolved.name} — outstanding advance ${inr(summary.outstanding)}.`;
  }

  // Missing / unresolved required fields.
  const missing: string[] = [];
  if (parsed.amount == null || !(parsed.amount > 0)) missing.push("amount");
  if (!isSettlement && !parsed.purposeCode) missing.push("category");
  if (!parsed.direction) missing.push("direction");
  if (isSettlement) {
    if (!otherPartyResolved) missing.push("person");
    else if (outstandingAdvance != null && outstandingAdvance <= 0) missing.push("no-outstanding-advance");
    else if (parsed.amount != null && outstandingAdvance != null && parsed.amount > outstandingAdvance) missing.push("amount-exceeds-outstanding");
    if (parsed.advanceSettlement === "RECOVERY" && !tContext.emptyState && !treasury) missing.push("treasury");
  }

  const isGuidedReceipt = parsed.direction === "MONEY_IN" && (party?.type === "DISTRIBUTOR" || party?.type === "SUPER_STOCKIST");
  if (!isGuidedReceipt && parsed.purposeCode !== "ADJ-GOV" && !tContext.emptyState && !treasury) missing.push("treasury");
  if (tContext.emptyState) missing.push("treasury-config");

  if (parsed.purposeCode === "SAL-EMP" && !employee) missing.push("employee");
  if ((parsed.purposeCode === "EXP-ADVANCE" || parsed.purposeCode === "EXP-REIMBURSEMENT") && !employee && !otherPartyResolved) missing.push("person");
  if ((parsed.purposeCode === "REC-INS") && !party && !parsed.partyText) missing.push("party");
  if (partyCandidates.length > 0) missing.push("party");
  // A person was named but could not be resolved to an existing employee or a previously-confirmed
  // Other Party — never post against an unresolved/fabricated identity (Founder rule). The review
  // card surfaces personResolution.proposal ("Add as Other Person?") so the Founder can resolve it
  // once, after which the same name resolves automatically on every future entry.
  if (personResolution?.status === "AMBIGUOUS" || personResolution?.status === "UNMATCHED") missing.push("person");
  if (skuLine) {
    if (skuLine.status !== "MATCHED") missing.push("product");
    missing.push(...skuLine.missing);
    notes.push("Product sale detected. Smart Finance has structured the line (product / qty / rate / tax) but one-tap posting of a sale still goes through the Sales walk-in order path — record it there, or use this as the checked reference.");
  }

  let confidence: SmartConfidence;
  if (missing.includes("amount") || missing.includes("category") || missing.includes("direction") || missing.includes("treasury-config")) confidence = "LOW";
  else if (missing.length > 0 || partyNotFound || assumed || parsed.directionInferred || personResolution?.status === "UNMATCHED") confidence = "MEDIUM";
  else confidence = "HIGH";

  const understood = !missing.includes("amount") && (isSettlement || !missing.includes("category")) && !missing.includes("direction");

  const moneyDeskDirection: MoneyDeskDirection | null = !parsed.direction
    ? null
    : parsed.direction === "MONEY_OUT"
      ? paymentMode === "CASH" ? "CASH_OUT" : "BANK_OUT"
      : paymentMode === "CASH" ? "CASH_IN" : "BANK_IN";

  let postAction: SmartFinanceDraft["postAction"] = null;
  let createPayload: Record<string, unknown> | null = null;
  let settlePayload: Record<string, unknown> | null = null;
  const dateIso = new Date(`${date}T00:00:00`).toISOString();

  if (isSettlement && otherPartyResolved && parsed.amount != null && !missing.includes("amount-exceeds-outstanding") && !missing.includes("no-outstanding-advance") && (parsed.advanceSettlement === "SETTLE" || treasury)) {
    postAction = "settle-advance";
    settlePayload =
      parsed.advanceSettlement === "RECOVERY"
        ? {
            dimensionId: otherPartyResolved.id,
            amount: parsed.amount,
            date: dateIso,
            kind: "RECOVERY_CASH",
            treasuryAccountId: treasury!.id,
            treasuryAccountCoaCode: treasury!.coaCode,
            reason: `Smart Finance: ${text}`.slice(0, 200),
          }
        : {
            dimensionId: otherPartyResolved.id,
            amount: parsed.amount,
            date: dateIso,
            kind: "SETTLE_TO_EXPENSE",
            // 5230 Miscellaneous — a deliberate, named default (never an invented account). The
            // review card lets the user change it before confirming.
            expenseAccountCode: "5230",
            reason: `Smart Finance: ${text}`.slice(0, 200),
          };
  } else if (understood && isGuidedReceipt && party) {
    postAction = "guided-receipt";
    createPayload = {
      payerType: party.type,
      payerId: party.id,
      payeeType: "COMPANY",
      payeeId: "COMPANY",
      amount: parsed.amount,
      reference: `Smart Finance — ${text}`.slice(0, 180),
      paymentMode: paymentMode === "UPI" ? "UPI" : paymentMode,
      paymentDate: dateIso,
      reason: `Smart Finance entry: ${text}`.slice(0, 240),
    };
  } else if (understood && parsed.purposeCode && moneyDeskDirection) {
    postAction = "money-desk-create";
    const counterpartyType =
      employee ? "EMPLOYEE" : otherPartyResolved ? "OTHER_PARTY" : parsed.purposeCode === "REC-INS" ? "CUSTOMER" : undefined;
    const counterpartyName =
      party?.name ?? employee?.name ?? otherPartyResolved?.name ?? (parsed.purposeCode === "REC-INS" || PERSON_PURPOSES.has(parsed.purposeCode) ? parsed.partyText ?? undefined : undefined);
    createPayload = {
      purposeCode: parsed.purposeCode,
      direction: moneyDeskDirection,
      amount: parsed.amount,
      date: dateIso,
      treasuryAccountId: treasury?.id,
      counterpartyType,
      counterpartyName,
      description: text.slice(0, 240),
      formData: {
        paymentMode,
        ...(employee ? { employeeId: employee.id } : {}),
        ...(otherPartyResolved ? { partyType: "OTHER_PARTY", partyId: otherPartyResolved.id } : {}),
        ...(territory ? { territoryId: territory.id } : {}),
        ...(treasury ? { treasuryAccountCoaCode: treasury.coaCode } : {}),
      },
    };
  }

  return {
    originalText: text,
    parsed,
    confidence,
    understood,
    postAction,
    settlePayload,
    direction: parsed.direction,
    moneyDeskDirection,
    purposeCode: parsed.purposeCode,
    purposeLabel,
    purposeHindiLabel,
    intentLabel,
    categoryAccount,
    amount: parsed.amount,
    date,
    paymentMode,
    treasury,
    treasuryAssumed: assumed,
    treasuryOptions: options,
    treasuryEmptyState: tContext.emptyState,
    party,
    partyType: parsed.partyTypeHint,
    partyText: parsed.partyText,
    partyCandidates,
    partyNotFound,
    employee,
    personResolution,
    skuLine,
    territory,
    territorySource,
    costCentre,
    explanations,
    purposeNote: parsed.purposeText,
    missingRequired: [...new Set(missing)],
    notes: [...new Set(notes)],
    createPayload,
  };
}

function safePurpose(code: string) {
  try {
    return purposeDefinition(code);
  } catch {
    return null;
  }
}
