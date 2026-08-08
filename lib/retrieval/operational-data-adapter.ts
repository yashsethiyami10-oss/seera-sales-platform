import { prisma } from "@/lib/prisma";
import type { RetrievalResult } from "./types";

/**
 * MUV AI Engineering Execution — Sprint 11 (Domain Foundations). Closes
 * Sprint 7's own disclosed gap: "Tier 2's actual OperationalDataAdapter/
 * CustomerIntelligence sources don't exist as concrete callable services
 * yet." Research before this sprint confirmed CustomerIntelligenceProfile
 * (Phase 6, lib/growth/*) is a complete, live, production system — this
 * file REUSES it directly via a read-only Prisma query, exactly matching
 * lib/retrieval/sources.ts's own established reasoning for why source
 * adapters query models directly rather than through admin-CRUD Server
 * Actions: retrieval must serve graduated clearance uniformly, and
 * lib/growth's own actions aren't shaped for that.
 *
 * `RetrievalResult.sourceType` has no CUSTOMER_INTELLIGENCE member (Module
 * 5's closed union, not extended by this sprint) — mapped to "KNOWLEDGE"
 * with `relationship: "OPERATIONAL"` carrying the real distinction,
 * mirroring Sprint 7's identical handling of Category/Variant scope via
 * `relationship` rather than widening sourceType.
 */
export async function fetchCustomerIntelligenceSignal(customerId: string): Promise<RetrievalResult | null> {
  // CustomerIntelligenceProfile has no declared Prisma relation to Customer
  // (only a bare customerId String @unique) — two queries, not a join.
  const [profile, customer] = await Promise.all([
    prisma.customerIntelligenceProfile.findUnique({ where: { customerId } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } }),
  ]);
  if (!profile) return null;

  const title = customer?.name ?? "Customer";
  const summary = `Status: ${profile.statusCode}. ${profile.totalOrders} order(s), ${(Number(profile.repeatPurchaseRate) * 100).toFixed(0)}% repeat rate, last purchase ${profile.lastPurchaseDate ? profile.lastPurchaseDate.toISOString().slice(0, 10) : "unknown"}.`;

  return {
    sourceType: "KNOWLEDGE",
    recordId: customerId,
    versionId: null,
    title: `Customer Intelligence — ${title}`,
    summary,
    layer: "INTERNAL",
    versionNumber: null,
    status: "PUBLISHED",
    priorityScore: 0,
    relationship: "OPERATIONAL",
    matchedFields: ["customerId"],
    confidence: 70,
    retrievedAt: new Date().toISOString(),
    sourceReferences: [],
    internalMetadata: {
      statusCode: profile.statusCode,
      totalOrders: profile.totalOrders,
      netRevenue: Number(profile.netRevenue),
      repeatPurchaseRate: Number(profile.repeatPurchaseRate),
      overdueInvoiceCount: profile.overdueInvoiceCount,
    },
  };
}
