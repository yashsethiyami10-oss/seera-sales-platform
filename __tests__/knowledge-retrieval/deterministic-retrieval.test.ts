import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ---- Database-safety gate: refuse unless this resolves to ep-falling-heart ----
function readEnvVar(filePath: string, name: string): string | null {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
  return match?.[1] ?? null;
}
const resolvedHost = new URL(process.env.DATABASE_URL ?? readEnvVar(path.resolve(process.cwd(), ".env.local"), "DATABASE_URL")!).hostname;
if (!resolvedHost.includes("ep-falling-heart")) {
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart.`);
}

import { prisma } from "@/lib/prisma";
import { fetchKnowledgeCandidates, fetchProductIntelligenceCandidates, fetchProblemIntelligenceCandidates, fetchCareIntelligenceCandidates } from "@/lib/retrieval/sources";
import type { CallerClearance, RetrievalContext } from "@/lib/retrieval/types";

/**
 * Block 2B, Stage 3 — deterministic retrieval verification.
 *
 * Exercises the EXISTING, already-live lib/retrieval/sources.ts fetchers
 * (Module 5 — Knowledge Retrieval Core) directly against the real,
 * newly-populated intelligence tables. Read-only.
 *
 * Important, verified real contract of these fetchers (not assumed): a
 * fetcher's Prisma `where` clause only ever filters on layer/status and,
 * when supplied, `productId`/`slug`/`category`/`tags` — `keywords` is
 * NEVER part of the DB filter. Every fetcher instead tags each in-scope
 * candidate's own `matchedFields` with `"keyword"` when a match is found,
 * purely as a signal for lib/retrieval/ranking.ts's scoring — ranking
 * sorts and scores but never drops zero-score candidates either. So
 * "no real match" is correctly observed via an ABSENT `"keyword"` (or
 * `"id"`/`"relationship"`/`"slug"`) tag on the irrelevant candidates, not
 * via an empty result array, except where a real DB-level filter
 * (`productId`/`slug`) is used — there, an empty array is the correct,
 * meaningful signal. Every assertion below matches this real contract.
 *
 * All of today's real population output is layer=INTERNAL/CONFIDENTIAL
 * and version status=DRAFT (verified in populate.test.ts) — nothing has
 * been promoted to PUBLIC/PUBLISHED. STAFF clearance with an explicit
 * non-published version mode is required to see any of it; ANONYMOUS/
 * CUSTOMER clearance must see none of it (a real DB-level layer filter)
 * — both sides of that boundary are verified below.
 */

const STAFF: CallerClearance = { role: "STAFF", maxLayer: "INTERNAL", canAccessNonPublished: true };
const ANONYMOUS: CallerClearance = { role: "ANONYMOUS", maxLayer: "PUBLIC", canAccessNonPublished: false };
const CUSTOMER: CallerClearance = { role: "CUSTOMER", maxLayer: "PUBLIC", canAccessNonPublished: false };

const HISTORY: RetrievalContext["versionSelector"] = { mode: "history" };
const DB_TIMEOUT = 20000;

async function productId(name: string): Promise<string> {
  const p = await prisma.product.findFirstOrThrow({ where: { name } });
  return p.id;
}

/** The single candidate, among an unfiltered fetch, whose title names the
 * given product — asserts it exists and returns it for further checks. */
function findByTitle(results: Awaited<ReturnType<typeof fetchProductIntelligenceCandidates>>, titleFragment: string) {
  const match = results.find((r) => r.title.includes(titleFragment));
  expect(match, `expected a candidate whose title includes "${titleFragment}"`).toBeDefined();
  return match!;
}

describe("Block 2B, Stage 3 — Deterministic Retrieval (live lib/retrieval/sources.ts)", () => {
  it("1. exact Product name match is tagged as a keyword match", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Muv Cool Water Liquid Detergent", versionSelector: HISTORY }, STAFF);
    expect(findByTitle(results, "Cool Water").matchedFields).toContain("keyword");
  }, DB_TIMEOUT);

  it("2. partial Product name match is tagged as a keyword match", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Cool Water", versionSelector: HISTORY }, STAFF);
    expect(findByTitle(results, "Cool Water").matchedFields).toContain("keyword");
  }, DB_TIMEOUT);

  it("3. misspelled Product name match (fuzzy fallback) is tagged as a keyword match", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Cool Watre", versionSelector: HISTORY }, STAFF);
    expect(findByTitle(results, "Cool Water").matchedFields).toContain("keyword");
  }, DB_TIMEOUT);

  it("4. a second, unrelated misspelling also resolves via the fuzzy fallback", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Lavendar Gardn", versionSelector: HISTORY }, STAFF);
    expect(findByTitle(results, "Lavender Garden").matchedFields).toContain("keyword");
  }, DB_TIMEOUT);

  it("5. category query (Fabric Care) is tagged as a keyword match for the 3 Liquid Detergent SKUs, sourced from productIdentity content", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Fabric Care", versionSelector: HISTORY }, STAFF);
    for (const name of ["Cool Water", "Lavender Garden", "Indian Rose"]) {
      expect(findByTitle(results, name).matchedFields).toContain("keyword");
    }
  }, DB_TIMEOUT);

  it("6. fragrance query is tagged as a keyword match", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Lavender Garden", versionSelector: HISTORY }, STAFF);
    expect(findByTitle(results, "Lavender Garden").matchedFields).toContain("keyword");
  }, DB_TIMEOUT);

  it("7. pack size query matches via the persisted variants array", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "5L", versionSelector: HISTORY }, STAFF);
    expect(findByTitle(results, "Cool Water").matchedFields).toContain("keyword");
  }, DB_TIMEOUT);

  it("8. benefits query is tagged as a keyword match", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "regular household laundry", versionSelector: HISTORY }, STAFF);
    expect(findByTitle(results, "Lavender Garden").matchedFields).toContain("keyword");
  }, DB_TIMEOUT);

  it("9. directions/usage-instructions query is tagged as a keyword match", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "bucket wash", versionSelector: HISTORY }, STAFF);
    expect(results.some((r) => r.matchedFields.includes("keyword"))).toBe(true);
  }, DB_TIMEOUT);

  it("10. safety query is tagged as a keyword match", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Keep out of reach of children", versionSelector: HISTORY }, STAFF);
    expect(results.some((r) => r.matchedFields.includes("keyword"))).toBe(true);
  }, DB_TIMEOUT);

  it("11. storage query is tagged as a keyword match", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "cool and dry place", versionSelector: HISTORY }, STAFF);
    expect(results.some((r) => r.matchedFields.includes("keyword"))).toBe(true);
  }, DB_TIMEOUT);

  it("12. FAQ query is tagged as a keyword match", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "front-load", versionSelector: HISTORY }, STAFF);
    expect(results.some((r) => r.matchedFields.includes("keyword"))).toBe(true);
  }, DB_TIMEOUT);

  it("13. direct-id / recommendation-input query returns a real DB-level filter — exactly one, stable candidate for a specific Product", async () => {
    const id = await productId("Muv Cool Water Liquid Detergent");
    const results = await fetchProductIntelligenceCandidates({ productId: id, versionSelector: HISTORY }, STAFF);
    expect(results).toHaveLength(1);
    expect(results[0]!.matchedFields).toContain("relationship");
  }, DB_TIMEOUT);

  it("14. problem query — Usage category is a real DB-level filter", async () => {
    const results = await fetchProblemIntelligenceCandidates({ category: "Usage", versionSelector: HISTORY }, STAFF);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.matchedFields.includes("category"))).toBe(true);
    expect(results.some((r) => r.title.toLowerCase().includes("dosage") || r.title.toLowerCase().includes("bucket"))).toBe(true);
  }, DB_TIMEOUT);

  it("15. care workflow query — direct slug lookup (real DB-level filter) for a specific workflow", async () => {
    const results = await fetchCareIntelligenceCandidates({ slug: "care-bleach-mixing-safety-escalation", versionSelector: HISTORY }, STAFF);
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toContain("Bleach-mixing");
  }, DB_TIMEOUT);

  it("16. unsafe chemical mixing — the bleach-mixing workflow is escalation-flagged, internal metadata visible only to staff+", async () => {
    const results = await fetchCareIntelligenceCandidates({ slug: "care-bleach-mixing-safety-escalation", versionSelector: HISTORY }, STAFF);
    expect(results[0]!.internalMetadata).not.toBeNull();
    expect((results[0]!.internalMetadata as Record<string, unknown>).escalationRequired).toBe(true);
  }, DB_TIMEOUT);

  it("17. unsupported claim — the system's own governed non-committal workflow is retrievable by slug", async () => {
    const results = await fetchCareIntelligenceCandidates({ slug: "care-unsupported-claim-honest-non-committal-reply", versionSelector: HISTORY }, STAFF);
    expect(results).toHaveLength(1);
  }, DB_TIMEOUT);

  it("18. nonexistent Product — a nonsense name is never tagged as a keyword/exact/relationship match against any real ProductIntelligence", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Muv Unicorn Sparkle Wash", versionSelector: HISTORY }, STAFF);
    expect(results.some((r) => r.matchedFields.includes("keyword") || r.matchedFields.includes("id") || r.matchedFields.includes("relationship"))).toBe(false);
  }, DB_TIMEOUT);

  it("18b. nonexistent Product — the system's own governed honest-non-fabrication workflow IS retrievable by slug", async () => {
    const results = await fetchCareIntelligenceCandidates({ slug: "care-nonexistent-product-honest-non-fabrication-reply", versionSelector: HISTORY }, STAFF);
    expect(results).toHaveLength(1);
  }, DB_TIMEOUT);

  it("19. Hindi-language query is never tagged as a keyword match against any real ProductIntelligence (honest no-match, not a crash)", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "कपड़े धोने का साबुन", versionSelector: HISTORY }, STAFF);
    expect(results.some((r) => r.matchedFields.includes("keyword"))).toBe(false);
  }, DB_TIMEOUT);

  it("20. Hinglish-language query is never tagged as a keyword match against any real ProductIntelligence (honest no-match, not a crash)", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "kapde dhone ka sabun", versionSelector: HISTORY }, STAFF);
    expect(results.some((r) => r.matchedFields.includes("keyword"))).toBe(false);
  }, DB_TIMEOUT);

  it("21. multi-turn context — the same productId query is stable/deterministic across two sequential calls", async () => {
    const id = await productId("Muv Cool Water Liquid Detergent");
    const turn1 = await fetchProductIntelligenceCandidates({ productId: id, versionSelector: HISTORY }, STAFF);
    const turn2 = await fetchProductIntelligenceCandidates({ productId: id, versionSelector: HISTORY }, STAFF);
    expect(turn1[0]!.recordId).toBe(turn2[0]!.recordId);
    expect(turn1[0]!.versionId).toBe(turn2[0]!.versionId);
  }, DB_TIMEOUT);

  it("22. governance-blocked products never surface via ProductIntelligence retrieval — real DB filter by id, and never keyword-tagged by name", async () => {
    const blockedId = await productId("Muv Black Phenyl");
    const byId = await fetchProductIntelligenceCandidates({ productId: blockedId, versionSelector: HISTORY }, STAFF);
    expect(byId).toHaveLength(0);

    const byKeyword = await fetchProductIntelligenceCandidates({ keywords: "Black Phenyl", versionSelector: HISTORY }, STAFF);
    expect(byKeyword.some((r) => r.matchedFields.includes("keyword"))).toBe(false);
  }, DB_TIMEOUT);

  it("23. no ProductIntelligence retrieval result ever exposes Ingredients/formula content", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Cool Water", versionSelector: HISTORY }, STAFF);
    for (const r of results) {
      expect((r.summary ?? "").toLowerCase()).not.toContain("ingredient");
      expect(r.title.toLowerCase()).not.toContain("ingredient");
    }
  }, DB_TIMEOUT);

  it("24. anonymous/customer clearance sees ZERO of today's populated content — no leakage before Founder publish (real DB-level layer filter)", async () => {
    const ctx: RetrievalContext = { keywords: "Cool Water" };
    const [anonKi, anonPi, anonPri, anonCi] = await Promise.all([
      fetchKnowledgeCandidates(ctx, ANONYMOUS),
      fetchProductIntelligenceCandidates(ctx, ANONYMOUS),
      fetchProblemIntelligenceCandidates(ctx, ANONYMOUS),
      fetchCareIntelligenceCandidates(ctx, ANONYMOUS),
    ]);
    expect([...anonKi, ...anonPi, ...anonPri, ...anonCi]).toHaveLength(0);

    const [custKi, custPi, custPri, custCi] = await Promise.all([
      fetchKnowledgeCandidates(ctx, CUSTOMER),
      fetchProductIntelligenceCandidates(ctx, CUSTOMER),
      fetchProblemIntelligenceCandidates(ctx, CUSTOMER),
      fetchCareIntelligenceCandidates(ctx, CUSTOMER),
    ]);
    expect([...custKi, ...custPi, ...custPri, ...custCi]).toHaveLength(0);
  }, DB_TIMEOUT);

  it("25. anonymous clearance also finds nothing even with an explicit non-published version request (mode is downgraded server-side, not honored blindly)", async () => {
    const results = await fetchProductIntelligenceCandidates({ keywords: "Cool Water", versionSelector: HISTORY }, ANONYMOUS);
    expect(results).toHaveLength(0);
  }, DB_TIMEOUT);

  it("26. dynamic commercial data is never duplicated as stale intelligence — sections/variants carry only tool references, never a stored price/stock figure", async () => {
    const id = await productId("Muv Cool Water Liquid Detergent");
    const results = await fetchProductIntelligenceCandidates({ productId: id, versionSelector: HISTORY }, STAFF);
    const pi = await prisma.productIntelligence.findUnique({ where: { productId: id }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } });
    const sectionsText = JSON.stringify(pi?.versions[0]?.sections ?? {});
    expect(sectionsText).toContain("priceResolutionTool");
    expect(sectionsText).toContain("availabilityResolutionTool");
    expect(sectionsText).not.toMatch(/"price"\s*:\s*\d/);
    expect(sectionsText).not.toMatch(/"mrp"\s*:\s*\d/);
    expect(results.length).toBeGreaterThan(0);
  }, DB_TIMEOUT);
});
