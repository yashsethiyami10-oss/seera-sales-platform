import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { istBusinessDayRange, istBusinessDayStart } from "./attendance-service";
import { executiveAuthorizedDistributors } from "./scope";
import { managerTeamEmployeeIds } from "./manager-service";
import { effectivePermissions } from "@/lib/foundation/authorization-service";

// Daily Counter Report — every counter (shop) the Executive covered on one IST business day, with
// what each one ordered, so the Executive can download it as a PDF and send it to the distributor
// on WhatsApp. Read-only: it only reads the Executive's OWN visits / orders (field_reports:
// view_self), the same self-scope the post-End-Day timeline already uses.

export type CounterOrderLine = {
  skuCode: string;
  product: string;
  pack: string;
  quantityText: string;
  baseQuantity: number;
  freeBaseQuantity: number;
  rate: number;
  amount: number;
};

export type CounterRow = {
  sequence: number;
  shopName: string;
  shopCode: string | null;
  ownerName: string | null;
  mobile: string | null;
  address: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  outcome: "ORDER" | "NO_ORDER" | "FOLLOW_UP" | "SKIPPED" | "CLOSED" | "VISITED";
  reason: string | null;
  isNewCounter: boolean;
  source: "VISIT" | "PHONE_OR_REPEAT";
  orders: { orderNumber: string; status: string; total: number; distributorName: string | null; notes: string | null; lines: CounterOrderLine[] }[];
};

export type DailyCounterReport = {
  reportNumber: string;
  businessDate: string; // ISO of IST midnight
  generatedAt: string;
  executive: { name: string; mobile: string | null; code: string };
  distributor: { name: string; code: string | null; town: string | null; mobile: string | null } | null;
  day: { startedAt: string | null; endedAt: string | null; workingType: string | null };
  counters: CounterRow[];
  productSummary: { skuCode: string; product: string; baseQuantity: number; freeBaseQuantity: number; amount: number; counters: number }[];
  totals: { counters: number; ordered: number; noOrder: number; newCounters: number; orders: number; value: number; pieces: number; freePieces: number };
};

type Json = Record<string, unknown> | null;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function retailerAddressText(address: unknown, pincode?: string | null): string | null {
  const a = (address ?? null) as Json;
  if (!a) return pincode ?? null;
  const parts = [str(a.line1), str(a.street), str(a.area), str(a.landmark), str(a.village), str(a.city), str(a.district)];
  const seen = new Set<string>();
  const text = parts.filter((p): p is string => !!p && !seen.has(p.toLowerCase()) && !!seen.add(p.toLowerCase())).join(", ");
  const pin = pincode ?? str(a.pincode);
  return text ? (pin && !text.includes(pin) ? `${text} – ${pin}` : text) : pin;
}

function lineQuantity(line: { orderedQuantity: unknown; packSnapshot: string; schemeSnapshot: unknown }) {
  const scheme = (line.schemeSnapshot ?? null) as Json;
  const base = Number(line.orderedQuantity ?? 0);
  const free = Number(scheme?.freeBaseQuantity ?? 0) || 0;
  const paidQty = scheme?.paidQuantity != null ? Number(scheme.paidQuantity) : null;
  const paidUom = str(scheme?.paidUom);
  const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
  let text = paidQty != null && paidUom && paidUom !== "PC" ? `${fmt(paidQty)} ${paidUom} (${fmt(base)} PC)` : `${fmt(base)} PC`;
  if (scheme?.freeQuantity) text += ` + ${fmt(Number(scheme.freeQuantity))} ${str(scheme.freeUom) ?? "PC"} free`;
  return { text, base, free };
}

const outcomeOf = (o: string, hasOrder: boolean): CounterRow["outcome"] => {
  if (hasOrder) return "ORDER";
  if (o === "NO_ORDER" || o === "FOLLOW_UP" || o === "SKIPPED" || o === "CLOSED") return o;
  return "VISITED";
};

const partnerName = (p: { legalName: string; tradeName: string | null }) => p.tradeName ?? p.legalName;
const partnerTown = (p: { addresses: unknown }) => {
  const a = p.addresses as Json | Json[];
  const one = Array.isArray(a) ? a[0] : a;
  return str(one?.city) ?? str(one?.town) ?? str(one?.district);
};

export async function assertCanViewCounterReport(db: PrismaClient, viewerId: string, employeeId: string | null): Promise<string> {
  if (!employeeId || employeeId === viewerId) {
    await authorize(db, { actorId: viewerId, permission: "field_reports:view_self" });
    return viewerId;
  }
  const perms = await effectivePermissions(db, viewerId);
  if (perms.has("system:super_admin") || perms.has("portal:admin")) return employeeId;
  if (perms.has("manager_team:view") && (await managerTeamEmployeeIds(db, viewerId)).includes(employeeId)) return employeeId;
  await db.auditLog.create({ data: { actorId: viewerId, action: "daily_counter_report.denied", entityType: "User", entityId: employeeId, outcome: "DENIED", reason: "NOT_OWNER_ADMIN_OR_ASSIGNED_MANAGER" } }).catch(() => undefined);
  throw new FoundationError("ACCESS_DENIED", "Only this executive, their assigned manager, the Admin or the Founder can open this report", 403);
}

export async function executiveDailyCounterReport(
  db: PrismaClient,
  viewerId: string,
  input: { date?: Date; distributorId?: string | null; employeeId?: string | null } = {},
): Promise<DailyCounterReport> {
  // Whose report: the signed-in executive's own by default. Someone else's only for the Founder /
  // Company Admin, or the manager that executive is assigned to — never another executive / manager.
  const actorId = await assertCanViewCounterReport(db, viewerId, input.employeeId ?? null);
  const businessDayStart = istBusinessDayStart(input.date ?? new Date());
  const [dayStart, dayEnd] = istBusinessDayRange(businessDayStart);

  const [employee, sessions, orders, authorized] = await Promise.all([
    db.user.findUnique({ where: { id: actorId }, select: { name: true, email: true, phone: true } }),
    db.seeraWorkSession.findMany({ where: { employeeId: actorId, startedAt: { gte: dayStart, lt: dayEnd } }, orderBy: { startedAt: "asc" } }),
    db.seeraSalesOrder.findMany({
      where: { salespersonId: actorId, createdAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ["DRAFT", "CANCELLED", "REJECTED"] } },
      orderBy: { createdAt: "asc" },
      include: {
        lines: { orderBy: { productNameSnapshot: "asc" } },
        sellerPartner: { select: { id: true, legalName: true, tradeName: true } },
        retailer: { select: { id: true, code: true, businessName: true, ownerName: true, mobile: true, address: true, pincode: true, distributorId: true, createdAt: true } },
      },
    }),
    executiveAuthorizedDistributors(db, actorId),
  ]);

  // Distributor filter: the report is meant to be SENT to one distributor, so it only carries that
  // distributor's counters and orders. Only a distributor this Executive is actually authorized for
  // can be named (no reading another distributor's name by guessing an id).
  const filterId = input.distributorId?.trim() || null;
  const distributorPartner = filterId ? authorized.find((d) => d.id === filterId) ?? null : null;
  if (filterId && !distributorPartner) throw new FoundationError("ACCESS_DENIED", "Distributor not in your scope", 403);
  // Header distributor: the one asked for, else the day's own Working Distributor.
  const workingId = filterId ?? sessions.at(-1)?.workingDistributorId ?? null;
  const working = distributorPartner ?? (workingId ? authorized.find((d) => d.id === workingId) ?? null : null);

  const sessionIds = sessions.map((s) => s.id);
  const visits = sessionIds.length
    ? await db.seeraVisit.findMany({
        where: { workSessionId: { in: sessionIds }, retailerId: { not: null } },
        orderBy: { checkedInAt: "asc" },
        include: { retailer: { select: { id: true, code: true, businessName: true, ownerName: true, mobile: true, address: true, pincode: true, distributorId: true, createdAt: true } } },
      })
    : [];

  const ordersInScope = filterId ? orders.filter((o) => o.sellerPartnerId === filterId) : orders;
  const toOrder = (o: (typeof orders)[number]) => ({
    orderNumber: o.orderNumber,
    status: o.status,
    total: Number(o.total),
    distributorName: o.sellerPartner ? partnerName(o.sellerPartner) : null,
    notes: o.notes,
    lines: o.lines.map((l) => {
      const q = lineQuantity(l);
      return { skuCode: l.skuCodeSnapshot, product: l.productNameSnapshot, pack: l.packSnapshot, quantityText: q.text, baseQuantity: q.base, freeBaseQuantity: q.free, rate: Number(l.priceSnapshot), amount: Number(l.lineTotal) };
    }),
  });

  const usedOrderIds = new Set<string>();
  const counters: CounterRow[] = [];
  for (const v of visits) {
    const r = v.retailer!;
    const visitOrders = ordersInScope.filter((o) => o.visitId === v.id || (!o.visitId && o.retailerId === r.id && !usedOrderIds.has(o.id) && o.createdAt >= v.checkedInAt && (!v.checkedOutAt || o.createdAt <= new Date(v.checkedOutAt.getTime() + 5 * 60_000))));
    const hadOtherDistributorOrder = filterId && orders.some((o) => o.visitId === v.id && o.sellerPartnerId !== filterId);
    if (filterId && !visitOrders.length && (hadOtherDistributorOrder || (r.distributorId && r.distributorId !== filterId))) continue;
    visitOrders.forEach((o) => usedOrderIds.add(o.id));
    counters.push({
      sequence: 0,
      shopName: r.businessName,
      shopCode: r.code,
      ownerName: r.ownerName,
      mobile: r.mobile,
      address: retailerAddressText(r.address, r.pincode),
      checkedInAt: v.checkedInAt.toISOString(),
      checkedOutAt: v.checkedOutAt?.toISOString() ?? null,
      outcome: outcomeOf(v.outcome, visitOrders.length > 0),
      reason: v.noOrderReason ?? v.skipReason ?? null,
      isNewCounter: r.createdAt >= dayStart && r.createdAt < dayEnd,
      source: "VISIT",
      orders: visitOrders.map(toOrder),
    });
  }
  // Phone / repeat orders booked today without a visit still have to reach the distributor.
  const remaining = ordersInScope.filter((o) => !usedOrderIds.has(o.id) && o.retailer);
  const byRetailer = new Map<string, typeof remaining>();
  for (const o of remaining) byRetailer.set(o.retailerId!, [...(byRetailer.get(o.retailerId!) ?? []), o]);
  for (const list of byRetailer.values()) {
    const r = list[0]!.retailer!;
    counters.push({
      sequence: 0,
      shopName: r.businessName,
      shopCode: r.code,
      ownerName: r.ownerName,
      mobile: r.mobile,
      address: retailerAddressText(r.address, r.pincode),
      checkedInAt: list[0]!.createdAt.toISOString(),
      checkedOutAt: null,
      outcome: "ORDER",
      reason: null,
      isNewCounter: r.createdAt >= dayStart && r.createdAt < dayEnd,
      source: "PHONE_OR_REPEAT",
      orders: list.map(toOrder),
    });
  }
  counters.sort((a, b) => (a.checkedInAt ?? "").localeCompare(b.checkedInAt ?? ""));
  counters.forEach((c, i) => (c.sequence = i + 1));

  const summary = new Map<string, DailyCounterReport["productSummary"][number] & { shops: Set<string> }>();
  for (const c of counters)
    for (const o of c.orders)
      for (const l of o.lines) {
        const key = l.skuCode;
        const s = summary.get(key) ?? { skuCode: l.skuCode, product: l.product, baseQuantity: 0, freeBaseQuantity: 0, amount: 0, counters: 0, shops: new Set<string>() };
        s.baseQuantity += l.baseQuantity;
        s.freeBaseQuantity += l.freeBaseQuantity;
        s.amount += l.amount;
        s.shops.add(`${c.shopCode ?? c.shopName}`);
        summary.set(key, s);
      }
  const productSummary = [...summary.values()]
    .map(({ shops, ...s }) => ({ ...s, counters: shops.size }))
    .sort((a, b) => b.amount - a.amount);

  const allOrders = counters.flatMap((c) => c.orders);
  const distributorContact = working ? await db.seeraPartner.findUnique({ where: { id: working.id }, select: { primaryContact: true } }) : null;
  const contact = (distributorContact?.primaryContact ?? null) as Json;
  const ist = new Date(businessDayStart.getTime() + 5.5 * 3_600_000);
  const ymd = `${ist.getUTCFullYear()}${String(ist.getUTCMonth() + 1).padStart(2, "0")}${String(ist.getUTCDate()).padStart(2, "0")}`;
  const code = actorId.slice(-6).toUpperCase();

  return {
    reportNumber: `SEERA/DCR/${ymd}/${code}${working?.code ? `/${working.code}` : ""}`,
    businessDate: businessDayStart.toISOString(),
    generatedAt: new Date().toISOString(),
    executive: { name: employee?.name ?? employee?.email ?? "Sales Executive", mobile: employee?.phone ?? null, code },
    distributor: working
      ? { name: partnerName(working), code: working.code ?? null, town: partnerTown(working), mobile: str(contact?.mobile) ?? str(contact?.phone) }
      : null,
    day: {
      startedAt: sessions[0]?.startedAt.toISOString() ?? null,
      endedAt: sessions.length && sessions.every((s) => s.endedAt) ? sessions.at(-1)!.endedAt!.toISOString() : null,
      workingType: sessions[0]?.workingType ?? null,
    },
    counters,
    productSummary,
    totals: {
      counters: counters.length,
      ordered: counters.filter((c) => c.outcome === "ORDER").length,
      noOrder: counters.filter((c) => c.outcome !== "ORDER").length,
      newCounters: counters.filter((c) => c.isNewCounter).length,
      orders: allOrders.length,
      value: allOrders.reduce((s, o) => s + o.total, 0),
      pieces: productSummary.reduce((s, p) => s + p.baseQuantity, 0),
      freePieces: productSummary.reduce((s, p) => s + p.freeBaseQuantity, 0),
    },
  };
}
