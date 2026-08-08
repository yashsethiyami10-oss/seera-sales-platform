import { prisma } from "@/lib/prisma";
import type { FounderDecisionSummary } from "./types";

/**
 * MUV AI — Stage 6C Runtime, Founder Decision Registry query helpers.
 *
 * Reads `FounderDecisionRegistryEntry` (added this stage, seeded with
 * FD-AIC-001 through FD-AIC-004 — see prisma/seed.ts). This is FD-AIC-002
 * level 1 ("Latest explicit Founder Decision") made queryable: an
 * append-only, dated, scoped ledger — never deleted, only superseded via
 * `status`/`supersedesId`. Read-only from every runtime module; nothing in
 * `lib/runtime/*` ever writes to this table.
 */

function toSummary(row: { decisionId: string; title: string; category: string; decisionText: string; scope: string; approvedAt: Date }): FounderDecisionSummary {
  return {
    decisionId: row.decisionId,
    title: row.title,
    category: row.category,
    decisionText: row.decisionText,
    scope: row.scope,
    approvedAt: row.approvedAt.toISOString(),
  };
}

/** Every APPROVED decision, most recently approved first — "latest
 * explicit Founder Decision" is always index 0 within a matching category. */
export async function getActiveFounderDecisions(): Promise<FounderDecisionSummary[]> {
  const rows = await prisma.founderDecisionRegistryEntry.findMany({
    where: { status: "APPROVED" },
    orderBy: { approvedAt: "desc" },
  });
  return rows.map(toSummary);
}

/**
 * Deterministic keyword match against `category`/`title`/`scope` — never a
 * semantic search. Given the registry is small (4 entries at Stage 6C),
 * this is intentionally simple; it should be revisited if the registry
 * grows large enough that keyword match starts missing relevant entries.
 */
export async function findApplicableFounderDecisions(topicKeywords: string[]): Promise<FounderDecisionSummary[]> {
  if (!topicKeywords.length) return [];
  const all = await getActiveFounderDecisions();
  const lowerKeywords = topicKeywords.map((k) => k.toLowerCase());
  return all.filter((d) => {
    const haystack = `${d.category} ${d.title} ${d.scope}`.toLowerCase();
    return lowerKeywords.some((k) => haystack.includes(k));
  });
}
