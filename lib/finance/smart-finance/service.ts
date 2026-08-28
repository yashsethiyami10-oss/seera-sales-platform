import type { PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { purposeDefinition, type MoneyDeskDirection } from "../money-desk-registry";
import { deriveCostCentre } from "../cost-centre";
import { searchEmployees } from "../quick-entry-service";
import { parseSmartFinance, type ParsedSmartFinance, type PartyTypeHint } from "./parser";

// SEERA SMART FINANCE — GOVERNED INTERPRETATION SERVICE. This is the bridge between the pure
// natural-language parser and the EXISTING Money Desk. It:
//   1. runs the deterministic parser,
//   2. re-resolves every hint against real, permission-scoped master data (treasury accounts,
//      vendors, distributors/S.S., employees, expense categories, territories),
//   3. computes a confidence level and the list of still-missing required fields,
//   4. returns a structured draft + a ready-to-submit payload for the EXISTING governed endpoint
//      (`money-desk-create`, or `guided-receipt` for distributor/S.S. receipts).
// It NEVER posts anything and NEVER invents a value the parser did not read or a master record
// does not contain (spec §21). The client always shows the editable review card before the user
// confirms, and the confirm goes through the same createMoneyDeskTransaction path as the guided
// form — same RBAC, approval policy, maker-checker, idempotency and audit.

export type SmartConfidence = "HIGH" | "MEDIUM" | "LOW";

export type PartyCandidate = { id: string; name: string; type: PartyTypeHint; territoryId?: string | null };

export type SmartFinanceDraft = {
  originalText: string;
  parsed: ParsedSmartFinance;
  confidence: SmartConfidence;
  understood: boolean;
  postAction: "money-desk-create" | "guided-receipt" | null;

  direction: "MONEY_IN" | "MONEY_OUT" | null;
  moneyDeskDirection: MoneyDeskDirection | null;
  purposeCode: string | null;
  purposeLabel: string | null;
  purposeHindiLabel: string | null;

  amount: number | null;
  date: string; // always resolved (defaults today)

  paymentMode: "CASH" | "BANK" | "UPI";
  treasury: { id: string; name: string; kind: string; coaCode: string } | null;
  treasuryAssumed: boolean;
  treasuryOptions: { id: string; name: string; kind: string; coaCode: string }[];

  party: PartyCandidate | null;
  partyType: PartyTypeHint | null;
  partyText: string | null;
  partyCandidates: PartyCandidate[];
  partyNotFound: boolean;

  employee: { id: string; name: string } | null;

  territory: { id: string; name: string } | null;
  territorySource: "distributor" | "employee-auto" | null;
  costCentre: string | null;

  purposeNote: string | null;
  missingRequired: string[];
  notes: string[];

  // A payload the client can POST directly (it only adds `idempotencyKey` + `formData.__smartFinance`).
  createPayload: Record<string, unknown> | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, " ").replace(/\s+/g, " ").trim();

function nameMatches(candidateName: string, query: string): boolean {
  const c = norm(candidateName);
  const q = norm(query);
  if (!c || !q) return false;
  if (c.includes(q) || q.includes(c)) return true;
  const qWords = q.split(" ").filter((w) => w.length >= 3);
  return qWords.length > 0 && qWords.every((w) => c.includes(w));
}

async function resolveTreasury(
  db: PrismaClient,
  parsed: ParsedSmartFinance,
): Promise<{ treasury: SmartFinanceDraft["treasury"]; assumed: boolean; options: SmartFinanceDraft["treasuryOptions"]; paymentMode: "CASH" | "BANK" | "UPI" }> {
  const accounts = await db.seeraTreasuryAccount.findMany({ where: { isActive: true }, select: { id: true, name: true, kind: true, chartOfAccountId: true } });
  const coaIds = accounts.map((a) => a.chartOfAccountId);
  const coas = await db.seeraChartOfAccount.findMany({ where: { id: { in: coaIds } }, select: { id: true, code: true } });
  const coaCode = new Map(coas.map((c) => [c.id, c.code]));
  const options = accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, coaCode: coaCode.get(a.chartOfAccountId) ?? "" }));

  const hint = parsed.treasuryHint;
  const paymentMode: "CASH" | "BANK" | "UPI" = hint?.kind === "CASH" ? "CASH" : hint?.kind === "UPI" ? "UPI" : "BANK";
  if (!hint) return { treasury: null, assumed: false, options, paymentMode };

  if (hint.kind === "CASH") {
    const cash = options.find((o) => o.kind === "CASH");
    return { treasury: cash ?? null, assumed: false, options, paymentMode };
  }
  const banks = options.filter((o) => o.kind === "BANK");
  if (hint.bankKeyword) {
    const named = banks.filter((b) => norm(b.name).includes(norm(hint.bankKeyword!)));
    if (named.length === 1) return { treasury: named[0]!, assumed: false, options, paymentMode };
    if (named.length > 1) return { treasury: null, assumed: false, options: named, paymentMode };
  }
  if (banks.length === 1) return { treasury: banks[0]!, assumed: true, options, paymentMode };
  return { treasury: null, assumed: false, options: banks.length ? banks : options, paymentMode };
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
  // CUSTOMER or no hint: no clean master to resolve against — carried as a free-text name.
  return { party: null, candidates: [], notFound: false };
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

  const date = parsed.date ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const def = parsed.purposeCode ? safePurpose(parsed.purposeCode) : null;
  const purposeLabel = def?.label ?? parsed.purposeLabel;
  const purposeHindiLabel = def?.hindiLabel ?? null;

  const { treasury, assumed, options, paymentMode } = await resolveTreasury(db, parsed);

  // Party / employee.
  let party: PartyCandidate | null = null;
  let partyCandidates: PartyCandidate[] = [];
  let partyNotFound = false;
  let employee: { id: string; name: string } | null = null;
  if (parsed.partyText) {
    const r = await resolveParty(db, actorId, permissions, parsed.partyTypeHint, parsed.partyText, notes);
    party = r.party;
    partyCandidates = r.candidates;
    partyNotFound = r.notFound;
    if (party?.type === "EMPLOYEE") employee = { id: party.id, name: party.name };
  }
  // Salary / reimbursement without an explicit "employee" word: still try the employee master.
  if (!employee && (parsed.purposeCode === "SAL-EMP" || parsed.purposeCode === "EXP-REIMBURSEMENT") && parsed.partyText && !party) {
    try {
      const found = await searchEmployees(db, actorId, parsed.partyText);
      const hits = found.filter((e) => nameMatches(e.name ?? e.email, parsed.partyText!));
      if (hits.length === 1) employee = { id: hits[0]!.id, name: hits[0]!.name ?? hits[0]!.email };
      else if (hits.length > 1) partyCandidates = hits.slice(0, 8).map((e) => ({ id: e.id, name: e.name ?? e.email, type: "EMPLOYEE" as const }));
      else partyNotFound = true;
    } catch {
      notes.push("Employee lookup needs expense:create permission.");
    }
  }

  // Territory / cost centre (display only; the governed handler re-derives on post).
  let territory: { id: string; name: string } | null = null;
  let territorySource: SmartFinanceDraft["territorySource"] = null;
  if ((party?.type === "DISTRIBUTOR" || party?.type === "SUPER_STOCKIST") && party.territoryId) {
    const node = await db.seeraGeographyNode.findUnique({ where: { id: party.territoryId }, select: { id: true, name: true } });
    if (node) { territory = node; territorySource = "distributor"; }
  } else if (employee) {
    territorySource = "employee-auto";
  }

  let costCentre: string | null = null;
  if (!territory && def?.quickEntryCategoryCode) {
    const cat = await db.seeraExpenseCategory.findFirst({ where: { code: def.quickEntryCategoryCode }, select: { chartOfAccountId: true, parentGroup: true } });
    costCentre = deriveCostCentre(cat ?? null, false);
  } else if (!territory && parsed.direction === "MONEY_OUT") {
    costCentre = "Corporate";
  }

  // Missing required fields.
  const missing: string[] = [];
  if (parsed.amount == null || !(parsed.amount > 0)) missing.push("amount");
  if (!parsed.purposeCode) missing.push("category");
  if (!parsed.direction) missing.push("direction");

  const isGuidedReceipt = parsed.direction === "MONEY_IN" && (party?.type === "DISTRIBUTOR" || party?.type === "SUPER_STOCKIST");
  if (!isGuidedReceipt && parsed.purposeCode !== "ADJ-GOV") {
    if (!treasury) missing.push("treasury");
  }
  if (parsed.purposeCode === "SAL-EMP" && !employee) missing.push("employee");
  if ((parsed.purposeCode === "EXP-REIMBURSEMENT" || parsed.purposeCode === "REC-INS") && !party && !employee && !parsed.partyText) missing.push("party");
  if (partyCandidates.length > 0) missing.push("party");

  // Confidence.
  let confidence: SmartConfidence;
  if (missing.includes("amount") || missing.includes("category") || missing.includes("direction")) confidence = "LOW";
  else if (missing.length > 0 || partyNotFound || assumed || parsed.directionInferred) confidence = "MEDIUM";
  else confidence = "HIGH";

  const understood = !missing.includes("amount") && !missing.includes("category") && !missing.includes("direction");

  const moneyDeskDirection: MoneyDeskDirection | null = !parsed.direction
    ? null
    : parsed.direction === "MONEY_OUT"
      ? paymentMode === "CASH" ? "CASH_OUT" : "BANK_OUT"
      : paymentMode === "CASH" ? "CASH_IN" : "BANK_IN";

  // Build the ready-to-submit payload.
  let postAction: SmartFinanceDraft["postAction"] = null;
  let createPayload: Record<string, unknown> | null = null;
  const dateIso = new Date(`${date}T00:00:00`).toISOString();

  if (understood && isGuidedReceipt && party) {
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
      parsed.purposeCode === "SAL-EMP" ? "EMPLOYEE" : parsed.purposeCode === "REC-INS" || parsed.purposeCode === "EXP-REIMBURSEMENT" ? "CUSTOMER" : undefined;
    const counterpartyName =
      party?.name ?? employee?.name ?? (parsed.purposeCode === "REC-INS" || parsed.purposeCode === "EXP-REIMBURSEMENT" ? parsed.partyText ?? undefined : undefined);
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
    direction: parsed.direction,
    moneyDeskDirection,
    purposeCode: parsed.purposeCode,
    purposeLabel,
    purposeHindiLabel,
    amount: parsed.amount,
    date,
    paymentMode,
    treasury,
    treasuryAssumed: assumed,
    treasuryOptions: options,
    party,
    partyType: parsed.partyTypeHint,
    partyText: parsed.partyText,
    partyCandidates,
    partyNotFound,
    employee,
    territory,
    territorySource,
    costCentre,
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
