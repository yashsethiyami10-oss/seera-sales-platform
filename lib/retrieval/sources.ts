import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { allowedLayers } from "./permissions";
import { scanTextForConfidentiality, hasBlockingConfidentialityFindings } from "@/lib/knowledge-reconciliation/confidentiality-scanner";
import type { CallerClearance, RetrievalContext, RetrievalResult, VersionSelector } from "./types";

/**
 * MUV AI — Knowledge Retrieval Core (KRC, Module 5) source adapters.
 *
 * These query the same Prisma models Modules 1–4 already define directly
 * — not their exported Server Actions. Deliberate: `getKnowledgeItem`/
 * `getProductIntelligence`/etc. are `requireStaff()`-gated (or admin-only),
 * built for one-off authenticated admin CRUD, not a unified, graduated-
 * clearance retrieval that must serve anonymous, customer, staff, and
 * admin callers differently within the *same* call. Reusing those actions
 * here would mean either blocking anonymous callers entirely or bypassing
 * their RBAC — neither is right. What *is* reused, and matters more, is
 * the data itself: no schema was duplicated, and every module's own
 * "current published version" derivation (highest versionNumber with
 * status filter) is repeated here in the exact same shape those modules
 * already established, not reinvented differently.
 */

const MAX_CANDIDATES_PER_SOURCE = 50;

// Knowledge (Module 1) has only DRAFT/PUBLISHED/ARCHIVED — no REVIEW stage,
// unlike Modules 2–4's four-state lifecycle. Not something Module 5
// changes (that would be redesigning Module 1); statusesFor() below
// intersects against each model's *own* valid set, so requesting
// mode:"review" against Knowledge correctly yields zero results instead
// of a type error or a silent mismatch.
const KNOWLEDGE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
const FOUR_STATE_STATUSES = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;

/** "Version Resolution" — translates a VersionSelector into the concrete,
 * model-specific status list to query, downgrading to PUBLISHED-only for
 * any caller without canAccessNonPublished regardless of what mode was
 * requested. This is the one place that guarantee is enforced for every
 * source. Generic over each model's own status enum (passed in as
 * `validStatuses`) rather than a shared `string[]`, so Prisma's generated
 * types stay precise at every call site instead of collapsing to `any`. */
function statusesFor<T extends string>(versionSelector: VersionSelector | undefined, clearance: CallerClearance, validStatuses: readonly T[]): T[] {
  const mode = versionSelector?.mode ?? "published";
  let requested: string[];
  if (mode === "published" || mode === "latest") requested = ["PUBLISHED"];
  else if (!clearance.canAccessNonPublished) requested = ["PUBLISHED"];
  else if (mode === "draft") requested = ["DRAFT"];
  else if (mode === "review") requested = ["REVIEW"];
  else if (mode === "archived") requested = ["ARCHIVED"];
  else if (mode === "history") requested = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"];
  else requested = ["PUBLISHED"];
  return validStatuses.filter((s) => requested.includes(s));
}

/** Classic Levenshtein edit distance — small, pure, no dependency. Used
 * only as a bounded fallback below; never the first match strategy. */
export function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

/** A single-token typo tolerance, scaled to word length so short words
 * don't collapse into unrelated ones (e.g. "oak" must never fuzzy-match
 * "oat"'s distance-1 neighbor set at the same tolerance as a long word). */
export function fuzzyToleranceFor(tokenLength: number): number {
  if (tokenLength <= 4) return 0;
  // Tolerance 2 (not 1) for medium-length words: plain Levenshtein scores
  // a common adjacent-letter transposition typo (e.g. "watre" for
  // "water") as distance 2, since substitution/insert/delete has no
  // single-op transposition — 1 would silently reject the single most
  // common class of real typo.
  if (tokenLength <= 6) return 2;
  return 3;
}

// Fuzzy fallback is deliberately restricted to short, identity-like
// haystacks (a Product name, a title) — never a large JSON/prose blob.
// Over a haystack with hundreds of natural-language tokens (a full
// `sections` dump), *some* token lands within edit-distance tolerance of
// almost any query purely by chance, which would turn "misspelling
// tolerance" into "matches everything." Titles/names are short and
// specific enough that a real edit-distance match is meaningful signal.
const MAX_FUZZY_HAYSTACK_LENGTH = 120;

function keywordHit(haystacks: (string | null | undefined)[], keywords: string | undefined): boolean {
  if (!keywords) return false;
  const needle = keywords.toLowerCase().trim();
  if (!needle) return false;
  if (haystacks.some((h) => h?.toLowerCase().includes(needle))) return true;

  // Misspelling fallback: every whitespace-separated token in the query
  // must have a bounded-edit-distance match among some (short) haystack's
  // own tokens. Deterministic and pure — never an AI guess.
  const needleTokens = needle.split(/\s+/).filter(Boolean);
  if (
    needleTokens.length > 0 &&
    haystacks.some((h) => {
      if (!h || h.length > MAX_FUZZY_HAYSTACK_LENGTH) return false;
      const hTokens = h.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
      return needleTokens.every((nt) => hTokens.some((ht) => levenshteinDistance(nt, ht) <= fuzzyToleranceFor(nt.length)));
    })
  ) {
    return true;
  }

  // Founder Publishing Review — Runtime Answer-Delivery Correction, Issue 2.
  // Both checks above only ever fire when the QUERY itself is short and
  // product-name-shaped. In real production use `keywords` is the
  // customer's whole raw message ("Tell me about Muv Cloud Walk Floor
  // Cleaner") — far longer than any title — so neither check above
  // realistically ever matches real traffic. This reverse direction
  // instead asks whether the QUERY contains a haystack's own identifying
  // text verbatim, rather than the other way around — deliberately kept
  // to a full, unambiguous substring match here (nothing token-level or
  // fuzzy): a single-shared-word version of this check was tried and
  // reverted after it broke deterministic-retrieval.test.ts's own
  // nonsense-query and blocked-product tests ("wash"/"phenyl" are real
  // words shared across several unrelated real products' names, so a
  // lone-token match falsely tagged completely unrelated products as
  // relevant). Batch-aware, frequency-based relevance — which token is
  // actually distinguishing versus merely a shared category suffix in
  // the current candidate set — needs visibility across all of a
  // fetcher's candidates at once, not one haystack at a time; that logic
  // lives in lib/retrieval/pipeline.ts's own relevance-filter stage
  // instead, precisely because it has that visibility and this function
  // does not.
  return haystacks.some((h) => {
    if (!h) return false;
    const identity = h.toLowerCase().trim();
    if (!identity || identity.length > MAX_FUZZY_HAYSTACK_LENGTH) return false;
    return needle.includes(identity);
  });
}

/**
 * Corrective Confidentiality Hardening (post-Founder-audit Finding H1) —
 * a defense-in-depth backstop applied to every fetcher's output, after
 * the existing layer/status filters. Even though `layer`/`versionSelector`
 * already correctly exclude today's real restricted content from every
 * PUBLIC-clearance (customer/anonymous) caller, this is a second,
 * independent gate: if restricted content ever reached this point for a
 * PUBLIC-clearance caller — through a future population bug, a manual
 * data edit, or any path this scanner's authors didn't anticipate — it is
 * dropped here, not merely relied upon to have been excluded upstream.
 * Never silent: every drop is logged with the record id and matched
 * category (never the matched text itself) so it remains auditable.
 * STAFF/ADMIN callers are never filtered — they need to see and correct
 * exactly this kind of finding, not have it hidden from them.
 */
function applyConfidentialityBackstop(results: RetrievalResult[], clearance: CallerClearance): RetrievalResult[] {
  if (clearance.maxLayer !== "PUBLIC") return results;
  return results.filter((r) => {
    const findings = [
      ...scanTextForConfidentiality(r.title, "title"),
      ...scanTextForConfidentiality(r.summary ?? "", "summary"),
    ];
    if (hasBlockingConfidentialityFindings(findings)) {
      logger.error("retrieval:confidentiality-backstop-suppressed-result", {
        sourceType: r.sourceType,
        recordId: r.recordId,
        categories: findings.map((f) => f.category),
      });
      return false;
    }
    return true;
  });
}

export async function fetchKnowledgeCandidates(ctx: RetrievalContext, clearance: CallerClearance): Promise<RetrievalResult[]> {
  const statuses = statusesFor(ctx.versionSelector, clearance, KNOWLEDGE_STATUSES);
  const items = await prisma.knowledgeItem.findMany({
    where: {
      layer: { in: allowedLayers(clearance) },
      ...(ctx.knowledgeId ? { id: ctx.knowledgeId } : {}),
      ...(ctx.slug ? { slug: ctx.slug } : {}),
      ...(ctx.productId ? { productId: ctx.productId } : {}),
      versions: {
        some: {
          status: { in: statuses },
          ...(ctx.versionSelector?.mode === "specific" && ctx.versionSelector.versionId ? { id: ctx.versionSelector.versionId } : {}),
        },
      },
    },
    take: MAX_CANDIDATES_PER_SOURCE,
    include: { versions: { where: { status: { in: statuses } }, orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  const results = items
    .filter((i) => i.versions[0])
    .map((i) => {
      const v = i.versions[0]!;
      const matchedFields: string[] = [];
      if (ctx.knowledgeId && ctx.knowledgeId === i.id) matchedFields.push("id");
      if (ctx.slug && ctx.slug === i.slug) matchedFields.push("slug");
      if (ctx.productId && ctx.productId === i.productId) matchedFields.push("relationship");
      if (keywordHit([i.title, v.content], ctx.keywords)) matchedFields.push("keyword");
      return {
        sourceType: "KNOWLEDGE",
        recordId: i.id,
        versionId: v.id,
        title: i.title,
        summary: v.content.length > 300 ? v.content.slice(0, 300) + "…" : v.content,
        layer: i.layer,
        versionNumber: v.versionNumber,
        status: v.status,
        priorityScore: 0,
        relationship: i.productId === ctx.productId && ctx.productId ? "direct" : null,
        matchedFields,
        confidence: 0,
        retrievedAt: new Date().toISOString(),
        sourceReferences: i.productId ? [{ type: "PRODUCT" as const, id: i.productId, linkKind: "direct" as const }] : [],
        internalMetadata: clearance.canAccessNonPublished ? { fileType: i.fileType } : null,
      } satisfies RetrievalResult;
    });
  return applyConfidentialityBackstop(results, clearance);
}

export async function fetchProductIntelligenceCandidates(ctx: RetrievalContext, clearance: CallerClearance): Promise<RetrievalResult[]> {
  const statuses = statusesFor(ctx.versionSelector, clearance, FOUR_STATE_STATUSES);
  const items = await prisma.productIntelligence.findMany({
    where: {
      layer: { in: allowedLayers(clearance) },
      ...(ctx.knowledgeId ? { id: ctx.knowledgeId } : {}),
      ...(ctx.productId ? { productId: ctx.productId } : {}),
      versions: {
        some: {
          status: { in: statuses },
          ...(ctx.versionSelector?.mode === "specific" && ctx.versionSelector.versionId ? { id: ctx.versionSelector.versionId } : {}),
        },
      },
    },
    take: MAX_CANDIDATES_PER_SOURCE,
    include: {
      product: { select: { name: true, slug: true } },
      versions: { where: { status: { in: statuses } }, orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  const results = items
    .filter((i) => i.versions[0])
    .map((i) => {
      const v = i.versions[0]!;
      const sections = (v.sections ?? {}) as Record<string, unknown>;
      const purpose = typeof sections.purpose === "string" ? sections.purpose : null;
      const sectionsText = JSON.stringify(sections);
      const matchedFields: string[] = [];
      if (ctx.knowledgeId && ctx.knowledgeId === i.id) matchedFields.push("id");
      if (ctx.productId && ctx.productId === i.productId) { matchedFields.push("relationship"); matchedFields.push("id"); }
      if (keywordHit([i.product.name, sectionsText], ctx.keywords)) matchedFields.push("keyword");
      return {
        sourceType: "PRODUCT_INTELLIGENCE",
        recordId: i.id,
        versionId: v.id,
        title: `Product Intelligence — ${i.product.name}`,
        summary: purpose ? (purpose.length > 300 ? purpose.slice(0, 300) + "…" : purpose) : null,
        layer: i.layer,
        versionNumber: v.versionNumber,
        status: v.status,
        priorityScore: 0,
        relationship: ctx.productId && ctx.productId === i.productId ? "direct" : null,
        matchedFields,
        confidence: 0,
        retrievedAt: new Date().toISOString(),
        sourceReferences: [{ type: "PRODUCT" as const, id: i.productId, label: i.product.name, linkKind: "direct" as const }],
        internalMetadata: clearance.canAccessNonPublished ? { productSlug: i.product.slug } : null,
      } satisfies RetrievalResult;
    });
  return applyConfidentialityBackstop(results, clearance);
}

export async function fetchProblemIntelligenceCandidates(ctx: RetrievalContext, clearance: CallerClearance): Promise<RetrievalResult[]> {
  const statuses = statusesFor(ctx.versionSelector, clearance, FOUR_STATE_STATUSES);
  const items = await prisma.problemIntelligence.findMany({
    where: {
      layer: { in: allowedLayers(clearance) },
      ...(ctx.knowledgeId ? { id: ctx.knowledgeId } : {}),
      ...(ctx.slug ? { slug: ctx.slug } : {}),
      versions: {
        some: {
          status: { in: statuses },
          ...(ctx.category ? { problemCategory: ctx.category } : {}),
          ...(ctx.tags?.length ? { tags: { hasSome: ctx.tags } } : {}),
          ...(ctx.versionSelector?.mode === "specific" && ctx.versionSelector.versionId ? { id: ctx.versionSelector.versionId } : {}),
          ...(ctx.productId ? { productRelationships: { some: { productId: ctx.productId } } } : {}),
        },
      },
    },
    take: MAX_CANDIDATES_PER_SOURCE,
    include: {
      versions: {
        where: { status: { in: statuses } },
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { productRelationships: { select: { productId: true }, take: 5 } },
      },
    },
  });

  const results = items
    .filter((i) => i.versions[0])
    .map((i) => {
      const v = i.versions[0]!;
      const matchedFields: string[] = [];
      if (ctx.knowledgeId && ctx.knowledgeId === i.id) matchedFields.push("id");
      if (ctx.slug && ctx.slug === i.slug) matchedFields.push("slug");
      if (ctx.category && ctx.category === v.problemCategory) matchedFields.push("category");
      if (ctx.tags?.length && v.tags.some((t) => ctx.tags!.includes(t))) matchedFields.push("tag");
      const linkedProduct = ctx.productId && v.productRelationships.some((r) => r.productId === ctx.productId);
      if (linkedProduct) matchedFields.push("relationship");
      if (keywordHit([v.publicTitle, v.summary], ctx.keywords)) matchedFields.push("keyword");
      return {
        sourceType: "PROBLEM_INTELLIGENCE",
        recordId: i.id,
        versionId: v.id,
        title: v.publicTitle,
        summary: v.summary,
        layer: i.layer,
        versionNumber: v.versionNumber,
        status: v.status,
        priorityScore: 0,
        relationship: linkedProduct ? "direct" : null,
        matchedFields,
        confidence: 0,
        retrievedAt: new Date().toISOString(),
        sourceReferences: v.productRelationships.map((r) => ({ type: "PRODUCT" as const, id: r.productId, linkKind: "direct" as const })),
        internalMetadata: clearance.canAccessNonPublished ? { riskLevel: v.riskLevel, escalationRequired: v.escalationRequired } : null,
      } satisfies RetrievalResult;
    });
  return applyConfidentialityBackstop(results, clearance);
}

export async function fetchCareIntelligenceCandidates(ctx: RetrievalContext, clearance: CallerClearance): Promise<RetrievalResult[]> {
  const statuses = statusesFor(ctx.versionSelector, clearance, FOUR_STATE_STATUSES);
  const items = await prisma.careIntelligence.findMany({
    where: {
      layer: { in: allowedLayers(clearance) },
      ...(ctx.knowledgeId ? { id: ctx.knowledgeId } : {}),
      ...(ctx.slug ? { slug: ctx.slug } : {}),
      versions: {
        some: {
          status: { in: statuses },
          ...(ctx.category ? { category: ctx.category } : {}),
          ...(ctx.tags?.length ? { situationTags: { hasSome: ctx.tags } } : {}),
          ...(ctx.versionSelector?.mode === "specific" && ctx.versionSelector.versionId ? { id: ctx.versionSelector.versionId } : {}),
          ...(ctx.productId ? { relatedProducts: { some: { id: ctx.productId } } } : {}),
          ...(ctx.problemIntelligenceId ? { relatedProblemIntelligence: { some: { id: ctx.problemIntelligenceId } } } : {}),
        },
      },
    },
    take: MAX_CANDIDATES_PER_SOURCE,
    include: {
      versions: {
        where: { status: { in: statuses } },
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { relatedProducts: { select: { id: true }, take: 5 } },
      },
    },
  });

  const results = items
    .filter((i) => i.versions[0])
    .map((i) => {
      const v = i.versions[0]!;
      const matchedFields: string[] = [];
      if (ctx.knowledgeId && ctx.knowledgeId === i.id) matchedFields.push("id");
      if (ctx.slug && ctx.slug === i.slug) matchedFields.push("slug");
      if (ctx.category && ctx.category === v.category) matchedFields.push("category");
      if (ctx.tags?.length && v.situationTags.some((t) => ctx.tags!.includes(t))) matchedFields.push("tag");
      const linkedProduct = ctx.productId && v.relatedProducts.some((p) => p.id === ctx.productId);
      if (linkedProduct) matchedFields.push("relationship");
      if (keywordHit([v.title, v.summary, v.situationDescription], ctx.keywords)) matchedFields.push("keyword");
      return {
        sourceType: "CARE_INTELLIGENCE",
        recordId: i.id,
        versionId: v.id,
        title: v.title,
        summary: v.summary,
        layer: i.layer,
        versionNumber: v.versionNumber,
        status: v.status,
        priorityScore: 0,
        relationship: linkedProduct ? "direct" : null,
        matchedFields,
        confidence: 0,
        retrievedAt: new Date().toISOString(),
        sourceReferences: v.relatedProducts.map((p) => ({ type: "PRODUCT" as const, id: p.id, linkKind: "direct" as const })),
        internalMetadata: clearance.canAccessNonPublished ? { escalationRequired: v.escalationRequired, riskPriority: v.escalationPriority } : null,
      } satisfies RetrievalResult;
    });
  return applyConfidentialityBackstop(results, clearance);
}
