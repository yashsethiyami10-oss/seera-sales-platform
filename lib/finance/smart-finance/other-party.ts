import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { OTHER_PARTY_DIMENSION_KIND } from "./context";

// SEERA SMART FINANCE — "OTHER PARTY" MASTER (Business Understanding Pass 2, Phase 1). When a
// transaction names a person who is NOT an assigned employee, Smart Finance must not fail and must
// not silently create an employee. It proposes a lightweight, governed "Other Party" record —
// modelled on the EXISTING SeeraFinancialDimension lookup (kind = OTHER_PARTY, same table
// Departments / Cost Centres use) — created ONLY after explicit confirmation and reused for that
// person's future entries. It never touches Role/UserRoleAssignment: an Other Party is never an
// employee, gets no login, no portal.
//
// Identity fields (mobile / relationship type / notes) are stored in the AUDIT TRAIL rather than
// dimension columns: SeeraFinancialDimension has none, and adding a `metadata Json?` column is
// blocked right now (the Neon TEST *direct* endpoint that `prisma migrate` needs is unreachable —
// see the pass report). The audit log is itself a governed, append-only, queryable store, indexed
// on (entityType, entityId, occurredAt); getOtherPartyIdentity() reads the latest
// finance.other_party.* event. When the direct endpoint is available, promoting these to a
// `metadata` column is a clean, additive follow-up with no behaviour change.

export const OTHER_PARTY_TYPES = ["Other Person", "Labour / Contractor", "Agent / Broker", "Transporter", "Landlord", "Government / Utility", "Farmer / Supplier (informal)", "Other"];

export type OtherPartyProposalField = { key: "name" | "mobile" | "partyType" | "purpose"; label: string; required: boolean; value: string; options?: string[] };
export type OtherPartyProposal = {
  suggestedName: string;
  suggestedType: string;
  fields: OtherPartyProposalField[];
  note: string;
};

export function buildOtherPartyProposal(rawName: string, purposeHint: string | null): OtherPartyProposal {
  const suggestedName = rawName.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    suggestedName,
    suggestedType: "Other Person",
    fields: [
      { key: "name", label: "Full name", required: true, value: suggestedName },
      { key: "mobile", label: "Mobile (optional)", required: false, value: "" },
      { key: "partyType", label: "Type", required: true, value: "Other Person", options: OTHER_PARTY_TYPES },
      { key: "purpose", label: "Purpose / context", required: false, value: purposeHint ?? "" },
    ],
    note: `"${suggestedName}" is not a known employee or party yet. Add them once as an Other Party and every future entry that names them will resolve automatically. This does NOT make them an employee.`,
  };
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, " ").replace(/\s+/g, " ").trim();
const digits = (s: string | undefined | null) => (s ?? "").replace(/\D/g, "");

export type OtherPartyIdentity = { mobile: string | null; partyType: string | null; notes: string | null; relationship: string | null };
export type ConfirmOtherPartyInput = { name: string; mobile?: string; partyType?: string; purpose?: string; relationship?: string; notes?: string };

function partyCode(name: string, mobile?: string) {
  return `OP-${createHash("sha256").update(`${norm(name)}:${digits(mobile)}`).digest("hex").slice(0, 10).toUpperCase()}`;
}

// GOVERNED create. Requires coa:manage (creating a finance master record — the same gate
// createDimension uses). Duplicate-safe: an active OTHER_PARTY whose normalized name OR mobile
// already matches is returned, never duplicated (spec §7 — never create an ambiguous identity).
// Idempotent on (kind, code); a previously-deactivated row is reactivated rather than colliding.
export async function confirmOtherParty(db: PrismaClient, actorId: string, input: ConfirmOtherPartyInput) {
  await authorize(db, { actorId, permission: "coa:manage" });
  const name = input.name.trim();
  if (name.length < 2) throw new FoundationError("OTHER_PARTY_NAME_REQUIRED", "A full name is required", 400);
  const mobile = digits(input.mobile) || undefined;
  if (mobile && (mobile.length < 7 || mobile.length > 15)) throw new FoundationError("OTHER_PARTY_MOBILE_INVALID", "Mobile number looks invalid", 400);

  const active = await db.seeraFinancialDimension.findMany({ where: { kind: OTHER_PARTY_DIMENSION_KIND, isActive: true }, select: { id: true, name: true } });
  const identities = await Promise.all(active.map(async (a) => ({ ...a, identity: await getOtherPartyIdentity(db, a.id) })));
  const byName = identities.find((e) => norm(e.name) === norm(name));
  if (byName) return { dimension: { id: byName.id, name: byName.name }, created: false as const, matchedOn: "name" as const };
  if (mobile) {
    const byMobile = identities.find((e) => digits(e.identity.mobile) === mobile);
    if (byMobile) return { dimension: { id: byMobile.id, name: byMobile.name }, created: false as const, matchedOn: "mobile" as const };
  }

  const code = partyCode(name, mobile);
  const byCode = await db.seeraFinancialDimension.findUnique({ where: { kind_code: { kind: OTHER_PARTY_DIMENSION_KIND, code } } });
  if (byCode) {
    if (!byCode.isActive) await db.seeraFinancialDimension.update({ where: { id: byCode.id }, data: { isActive: true } });
    return { dimension: { id: byCode.id, name: byCode.name }, created: false as const, matchedOn: "code" as const };
  }

  const dimension = await db.seeraFinancialDimension.create({ data: { kind: OTHER_PARTY_DIMENSION_KIND, code, name } });
  await recordAudit(db, {
    actorId,
    action: "finance.other_party.created",
    entityType: "SeeraFinancialDimension",
    entityId: dimension.id,
    afterState: { name, mobile: mobile ?? null, partyType: input.partyType ?? "Other Person", relationship: input.relationship ?? null, notes: input.notes ?? input.purpose ?? null },
  });
  return { dimension: { id: dimension.id, name: dimension.name }, created: true as const, matchedOn: null };
}

// GOVERNED update of the identity fields (and optionally the name). Each call appends a
// finance.other_party.updated audit event (before → after) — the read side always sees the latest.
export async function updateOtherParty(
  db: PrismaClient,
  actorId: string,
  dimensionId: string,
  patch: { name?: string; mobile?: string; partyType?: string; relationship?: string; notes?: string },
) {
  await authorize(db, { actorId, permission: "coa:manage" });
  const row = await db.seeraFinancialDimension.findUniqueOrThrow({ where: { id: dimensionId } });
  if (row.kind !== OTHER_PARTY_DIMENSION_KIND) throw new FoundationError("NOT_AN_OTHER_PARTY", "That record is not an Other Party", 400);
  const before = await getOtherPartyIdentity(db, dimensionId);

  let name = row.name;
  if (patch.name && patch.name.trim().length >= 2 && norm(patch.name) !== norm(row.name)) {
    name = patch.name.trim();
    const clash = await db.seeraFinancialDimension.findFirst({ where: { kind: OTHER_PARTY_DIMENSION_KIND, isActive: true, id: { not: dimensionId }, name: { equals: name, mode: "insensitive" } } });
    if (clash) throw new FoundationError("OTHER_PARTY_NAME_TAKEN", `Another Other Party is already called "${name}"`, 409);
    await db.seeraFinancialDimension.update({ where: { id: dimensionId }, data: { name } });
  }

  const after: OtherPartyIdentity = {
    mobile: patch.mobile !== undefined ? digits(patch.mobile) || null : before.mobile,
    partyType: patch.partyType !== undefined ? patch.partyType || null : before.partyType,
    relationship: patch.relationship !== undefined ? patch.relationship || null : before.relationship,
    notes: patch.notes !== undefined ? patch.notes || null : before.notes,
  };
  await recordAudit(db, {
    actorId,
    action: "finance.other_party.updated",
    entityType: "SeeraFinancialDimension",
    entityId: dimensionId,
    beforeState: { name: row.name, ...before },
    afterState: { name, ...after },
  });
  return { id: dimensionId, name, identity: after };
}

export async function setOtherPartyActive(db: PrismaClient, actorId: string, dimensionId: string, isActive: boolean) {
  await authorize(db, { actorId, permission: "coa:manage" });
  const row = await db.seeraFinancialDimension.findUniqueOrThrow({ where: { id: dimensionId } });
  if (row.kind !== OTHER_PARTY_DIMENSION_KIND) throw new FoundationError("NOT_AN_OTHER_PARTY", "That record is not an Other Party", 400);
  const updated = await db.seeraFinancialDimension.update({ where: { id: dimensionId }, data: { isActive } });
  await recordAudit(db, { actorId, action: isActive ? "finance.other_party.reactivated" : "finance.other_party.deactivated", entityType: "SeeraFinancialDimension", entityId: dimensionId, beforeState: { isActive: row.isActive }, afterState: { isActive } });
  return { id: updated.id, name: updated.name, isActive: updated.isActive };
}

// Latest identity from the audit trail. Never throws — a dimension with no identity event (should
// not happen for OTHER_PARTY, but defensively) returns all-null.
export async function getOtherPartyIdentity(db: PrismaClient, dimensionId: string): Promise<OtherPartyIdentity> {
  const event = await db.auditLog.findFirst({
    where: { entityType: "SeeraFinancialDimension", entityId: dimensionId, action: { in: ["finance.other_party.created", "finance.other_party.updated"] } },
    orderBy: { occurredAt: "desc" },
    select: { afterState: true },
  });
  const s = (event?.afterState ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return { mobile: str(s.mobile), partyType: str(s.partyType), notes: str(s.notes), relationship: str(s.relationship) };
}

export async function listOtherParties(db: PrismaClient, actorId: string, opts: { q?: string; includeInactive?: boolean } = {}) {
  await authorize(db, { actorId, permission: "expense:create" });
  const rows = await db.seeraFinancialDimension.findMany({
    where: { kind: OTHER_PARTY_DIMENSION_KIND, ...(opts.includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
    take: 500,
  });
  const q = opts.q ? norm(opts.q) : null;
  const filtered = q ? rows.filter((r) => norm(r.name).includes(q)) : rows;
  return Promise.all(
    filtered.map(async (r) => ({ id: r.id, name: r.name, isActive: r.isActive, identity: await getOtherPartyIdentity(db, r.id) })),
  );
}

export async function getOtherParty(db: PrismaClient, actorId: string, dimensionId: string) {
  await authorize(db, { actorId, permission: "expense:create" });
  const row = await db.seeraFinancialDimension.findUniqueOrThrow({ where: { id: dimensionId } });
  if (row.kind !== OTHER_PARTY_DIMENSION_KIND) throw new FoundationError("NOT_AN_OTHER_PARTY", "That record is not an Other Party", 400);
  return { id: row.id, name: row.name, isActive: row.isActive, identity: await getOtherPartyIdentity(db, dimensionId) };
}
