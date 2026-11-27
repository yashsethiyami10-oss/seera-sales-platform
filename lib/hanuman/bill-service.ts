/**
 * Hanuman billing for Seera (Founder, 2026-11-27: "Seera ka admin panel khol, is party ka bill bana
 * ke uske number pe bhej de"). Same contract as MUV's /api/hanuman/billing (bill_parties,
 * bill_catalog, bill_draft, bill_send), so Hanuman's preview -> "Bhejo" tap -> send flow works
 * unchanged. It runs exactly what Money Desk / Finance OS run for a Company invoice:
 * createBillingDraft -> issueBillingDraft (numbering, verified Company Profile, tax checks, ledger)
 * -> sendDocumentViaWhatsApp (the real PDF to the party's mobile on file), as the Founder's own
 * user, so every permission, scope and audit rule of those services still applies.
 *
 * A party id is "R:<retailerId>" or "P:<partnerId>" (Distributor / Super Stockist). Rates come from
 * the active price list for the buyer's tier (Super Stockist: COMPANY_TO_SS, Distributor:
 * SS_TO_DISTRIBUTOR, Retailer: DISTRIBUTOR_TO_RETAILER), else MRP, the same fallback the billing
 * screen uses; never a rate sent by Hanuman.
 */
import type { PriceTier, PrismaClient } from "@prisma/client";
import { prisma as defaultDb } from "@/lib/prisma";
import { createBillingDraft, issueBillingDraft } from "@/lib/sales-distribution/billing-service";
import { sendDocumentViaWhatsApp } from "@/lib/sales-distribution/document-service";
import { buildLineSnapshots, totalsOf } from "@/lib/sales-distribution/document-lines";
import { getMessagingProvider } from "@/lib/messaging";

class BillError extends Error { constructor(message: string, public status = 422) { super(message); } }

type Party = { kind: "R" | "P"; id: string; buyerType: "RETAILER" | "DISTRIBUTOR" | "SUPER_STOCKIST"; name: string; city: string | null; mobile: string | null };
export type BillLine = { variantId: string; quantity: number; discountPercent?: number };

const TIER: Record<Party["buyerType"], PriceTier> = { SUPER_STOCKIST: "COMPANY_TO_SS", DISTRIBUTOR: "SS_TO_DISTRIBUTOR", RETAILER: "DISTRIBUTOR_TO_RETAILER" };
const masked = (m: string | null) => { const d = (m ?? "").replace(/\D/g, ""); return d.length >= 10 ? `…${d.slice(-4)}` : null; };
const cityOf = (address: unknown): string | null => {
  const a = (address ?? {}) as Record<string, unknown>;
  return (typeof a.city === "string" && a.city) || (typeof a.district === "string" && a.district) || null;
};

/** The Founder's own Seera user: the earliest active FOUNDER_SUPER_ADMIN assignment. */
export async function founderActorId(db: PrismaClient = defaultDb): Promise<string> {
  const a = await db.userRoleAssignment.findFirst({
    where: { status: "ACTIVE", role: { code: "FOUNDER_SUPER_ADMIN" }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
    orderBy: { assignedAt: "asc" }, select: { userId: true },
  });
  if (!a) throw new BillError("No active Founder user in Seera", 403);
  return a.userId;
}

async function loadParty(db: PrismaClient, partyId: string): Promise<Party> {
  const [kind, id] = [partyId.slice(0, 1), partyId.slice(2)];
  if (kind === "R" && partyId[1] === ":") {
    const r = await db.seeraRetailer.findUnique({ where: { id }, select: { id: true, businessName: true, mobile: true, address: true } });
    if (r) return { kind: "R", id: r.id, buyerType: "RETAILER", name: r.businessName, city: cityOf(r.address), mobile: r.mobile };
  }
  if (kind === "P" && partyId[1] === ":") {
    const p = await db.seeraPartner.findUnique({ where: { id }, select: { id: true, type: true, legalName: true, tradeName: true, primaryContact: true, addresses: true } });
    if (p && (p.type === "DISTRIBUTOR" || p.type === "SUPER_STOCKIST")) {
      const addr = Array.isArray(p.addresses) ? p.addresses[0] : p.addresses;
      return { kind: "P", id: p.id, buyerType: p.type, name: p.tradeName ?? p.legalName, city: cityOf(addr), mobile: (p.primaryContact as { mobile?: string } | null)?.mobile ?? null };
    }
  }
  throw new BillError("Party not found (use an id from bill_parties)", 404);
}

export async function findParties(query: string, db: PrismaClient = defaultDb) {
  const q = query.trim();
  const digits = q.replace(/\D/g, "");
  const [retailers, partners] = await Promise.all([
    db.seeraRetailer.findMany({
      where: { OR: [{ businessName: { contains: q, mode: "insensitive" } }, { ownerName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ normalizedMobile: { contains: digits } }] : [])] },
      take: 8, orderBy: { updatedAt: "desc" }, select: { id: true, businessName: true, ownerName: true, mobile: true, address: true, lifecycle: true },
    }),
    db.seeraPartner.findMany({
      where: { type: { in: ["DISTRIBUTOR", "SUPER_STOCKIST"] }, OR: [{ legalName: { contains: q, mode: "insensitive" } }, { tradeName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] },
      take: 8, orderBy: { updatedAt: "desc" }, select: { id: true, type: true, legalName: true, tradeName: true, primaryContact: true, addresses: true, lifecycle: true },
    }),
  ]);
  return {
    parties: [
      ...partners.map((p) => ({ customerId: `P:${p.id}`, name: p.tradeName ?? p.legalName, kind: p.type, city: cityOf(Array.isArray(p.addresses) ? p.addresses[0] : p.addresses), phone: masked((p.primaryContact as { mobile?: string } | null)?.mobile ?? null), status: p.lifecycle })),
      ...retailers.map((r) => ({ customerId: `R:${r.id}`, name: r.businessName, kind: "RETAILER", contact: r.ownerName, city: cityOf(r.address), phone: masked(r.mobile), status: r.lifecycle })),
    ],
  };
}

async function activeSkus(db: PrismaClient, tier: PriceTier, ids?: string[]) {
  const now = new Date();
  return db.seeraSku.findMany({
    where: { status: "ACTIVE", ...(ids ? { id: { in: ids } } : {}) },
    include: { prices: { where: { tier, status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }, orderBy: { effectiveFrom: "desc" }, take: 1 } },
    orderBy: { productName: "asc" }, take: 300,
  });
}

/** The catalogue with retailer-tier rates; the bill itself is priced for the actual buyer's tier. */
export async function catalog(db: PrismaClient = defaultDb) {
  const skus = await activeSkus(db, "DISTRIBUTOR_TO_RETAILER");
  const byProduct = new Map<string, { variantId: string; size: string; price: number }[]>();
  for (const s of skus) {
    const list = byProduct.get(s.productName) ?? [];
    list.push({ variantId: s.id, size: `${Number(s.packSize)} ${s.unitType} (${s.code})`, price: Number(s.prices[0]?.amount ?? s.mrp) });
    byProduct.set(s.productName, list);
  }
  return { catalog: [...byProduct.entries()].map(([product, variants]) => ({ product, variants })), note: "Prices shown are the retailer rate; Distributor / Super Stockist bills use their own price list." };
}

async function priced(db: PrismaClient, party: Party, lines: BillLine[]) {
  const skus = await activeSkus(db, TIER[party.buyerType], lines.map((l) => l.variantId));
  const byId = new Map(skus.map((s) => [s.id, s]));
  const missing = lines.filter((l) => !byId.has(l.variantId));
  if (missing.length) throw new BillError(`Unknown or inactive product: ${missing.map((m) => m.variantId).join(", ")}`, 404);
  const input = lines.map((l) => {
    const s = byId.get(l.variantId)!;
    return { skuId: s.id, quantity: l.quantity, rate: Number(s.prices[0]?.amount ?? s.mrp), discountPct: l.discountPercent ?? 0 };
  });
  const snapshots = await buildLineSnapshots(db, input, { enforceTax: false });
  return { input, snapshots, totals: totalsOf(snapshots), byId };
}

export async function draftBill(customerId: string, lines: BillLine[], db: PrismaClient = defaultDb) {
  const party = await loadParty(db, customerId);
  const { input, snapshots, totals, byId } = await priced(db, party, lines);
  return {
    party: { customerId, name: party.name, city: party.city, phone: masked(party.mobile), kind: party.buyerType },
    lines: input.map((l, i) => ({ item: `${byId.get(l.skuId)!.productName} ${Number(byId.get(l.skuId)!.packSize)} ${byId.get(l.skuId)!.unitType}`, quantity: l.quantity, unitPrice: l.rate, discountPercent: l.discountPct, lineTotal: Number((snapshots[i] as { lineTotal?: number }).lineTotal ?? 0) })),
    totals: { grandTotal: totals.grandTotal },
    canSend: !!masked(party.mobile),
  };
}

/** Creates (or resumes) the Company tax invoice, issues it and WhatsApps the PDF. Idempotent per requestId. */
export async function sendBill(customerId: string, lines: BillLine[], requestId: string, db: PrismaClient = defaultDb, deps = { getProvider: getMessagingProvider }) {
  const party = await loadParty(db, customerId);
  const actorId = await founderActorId(db);
  const { input } = await priced(db, party, lines);
  const key = `hanuman-bill:${requestId}`;
  const draft = await createBillingDraft(db, actorId, {
    type: "TAX_INVOICE", issuerType: "COMPANY", issuerId: "COMPANY", buyerType: party.buyerType, buyerId: party.id,
    sourcePortal: "hanuman", lines: input, notes: "Bill made by Hanuman on the Founder's instruction", idempotencyKey: key,
  });
  const issued = draft.status === "DRAFT" ? await issueBillingDraft(db, actorId, draft.id) : draft;
  let send: { via: string; status: string; error: string | null };
  try {
    const r = await sendDocumentViaWhatsApp(db, actorId, issued.id, { recipientType: party.kind === "R" ? "RETAILER" : "PARTNER", recipientId: party.id, getProvider: deps.getProvider, idempotencyKey: key });
    send = { via: "WHATSAPP_DOCUMENT", status: r.sent ? "SENT" : "FAILED", error: null };
  } catch (e) {
    send = { via: "NONE", status: "FAILED", error: e instanceof Error ? e.message : String(e) };
  }
  return { orderId: issued.id, orderNumber: issued.documentNumber, grandTotal: Number(issued.grandTotal), alreadyCreated: draft.status !== "DRAFT", send };
}
