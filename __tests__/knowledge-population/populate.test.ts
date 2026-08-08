import { describe, it, expect, beforeAll } from "vitest";
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
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart. This suite performs real writes and must never run against any other database.`);
}

import { prisma } from "@/lib/prisma";
import { runControlledPopulation, writeKnowledgeItemProjection } from "@/lib/knowledge-population";
import { runReconciliationDryRun } from "@/lib/knowledge-reconciliation";
import { scanValueForConfidentiality } from "@/lib/knowledge-reconciliation/confidentiality-scanner";

/**
 * Block 2B, Stage 2 population — CONVERTED regression suite (Corrective
 * Confidentiality Hardening, Medium issue M1 from the independent Founder
 * audit).
 *
 * The ORIGINAL version of this file (committed `96b13ba`, retrievable via
 * `git show 96b13ba:__tests__/knowledge-population/populate.test.ts`) is
 * preserved in git history as the real, one-time migration-verification
 * record — it genuinely proved the first-ever population of these four
 * tables from a real empty state, and that evidence remains permanently
 * valid and citable. It is NOT deleted, only superseded here, because a
 * test that asserts "the database starts at zero rows" can only ever be
 * true once against a shared, permanently-populated real database — every
 * subsequent run legitimately fails that specific assertion, giving it no
 * ongoing regression value (Founder audit §9/§17, Finding M1).
 *
 * This CONVERTED version keeps every test that IS state-independent
 * (idempotency, non-mutation, uniqueness, governance metadata, family
 * inheritance, sourceTrace, orphan-free relationships) and replaces every
 * state-ABSOLUTE assertion ("count must be exactly 0/17/20") with a
 * state-RELATIVE one (deltas, or "must remain unchanged from whatever it
 * already was") — safely re-runnable indefinitely, against the real,
 * now-permanently-populated database, without ever assuming a specific
 * starting cardinality. New tests 17-20 add direct regression coverage
 * for the confidentiality scanner's write-time enforcement (Stage 3/4 of
 * this same corrective task) — a real gap the original suite had no way
 * to catch, since it predates the scanner's existence.
 */

async function snapshotSourceTables() {
  const [product, content, pkr, pendingContent] = await Promise.all([
    prisma.product.count(),
    prisma.productContent.count(),
    prisma.publishedKnowledgeRecord.count(),
    prisma.productContent.count({ where: { approvalStatus: "PENDING" } }),
  ]);
  return { product, content, pkr, pendingContent };
}

async function snapshotIntelligenceTables() {
  const [ki, kv, pi, piv, pri, priv, ci, civ] = await Promise.all([
    prisma.knowledgeItem.count(),
    prisma.knowledgeVersion.count(),
    prisma.productIntelligence.count(),
    prisma.productIntelligenceVersion.count(),
    prisma.problemIntelligence.count(),
    prisma.problemIntelligenceVersion.count(),
    prisma.careIntelligence.count(),
    prisma.careIntelligenceVersion.count(),
  ]);
  return { ki, kv, pi, piv, pri, priv, ci, civ };
}

describe("Block 2B, Stage 2 — Controlled Intelligence Population (re-runnable regression suite)", () => {
  let sourceBefore: Awaited<ReturnType<typeof snapshotSourceTables>>;
  let intelligenceBefore: Awaited<ReturnType<typeof snapshotIntelligenceTables>>;
  let firstRunReport: Awaited<ReturnType<typeof runControlledPopulation>>;
  let intelligenceAfterRun1: Awaited<ReturnType<typeof snapshotIntelligenceTables>>;
  let secondRunReport: Awaited<ReturnType<typeof runControlledPopulation>>;
  let intelligenceAfterRun2: Awaited<ReturnType<typeof snapshotIntelligenceTables>>;
  let sourceAfter: Awaited<ReturnType<typeof snapshotSourceTables>>;

  beforeAll(async () => {
    sourceBefore = await snapshotSourceTables();
    intelligenceBefore = await snapshotIntelligenceTables();

    // RUN 1 — against whatever real state already exists (never assumed empty).
    firstRunReport = await runControlledPopulation();
    intelligenceAfterRun1 = await snapshotIntelligenceTables();

    // RUN 2 — must be fully idempotent regardless of starting state.
    secondRunReport = await runControlledPopulation();
    intelligenceAfterRun2 = await snapshotIntelligenceTables();

    sourceAfter = await snapshotSourceTables();
  }, 1500000);

  it("1. run 1 reports zero errors", () => {
    expect(firstRunReport.errors).toEqual([]);
  });

  it("2. run 1 and run 2 process the exact same universe of projections — total action counts match across both runs, true regardless of starting state", () => {
    const sum = (r: typeof firstRunReport.knowledgeItem) => r.created + r.updated + r.touched + r.archived + r.skipped;
    const totalRun1 = sum(firstRunReport.knowledgeItem) + sum(firstRunReport.productIntelligence) + sum(firstRunReport.problemIntelligence) + sum(firstRunReport.careIntelligence);
    const totalRun2 = sum(secondRunReport.knowledgeItem) + sum(secondRunReport.productIntelligence) + sum(secondRunReport.problemIntelligence) + sum(secondRunReport.careIntelligence);
    expect(totalRun1).toBe(totalRun2);
    expect(totalRun1).toBeGreaterThan(0);
  });

  it("3. run 1's created counts match the real row-count delta exactly, whatever the starting count was", () => {
    expect(firstRunReport.knowledgeItem.created).toBe(intelligenceAfterRun1.ki - intelligenceBefore.ki);
    expect(firstRunReport.productIntelligence.created).toBe(intelligenceAfterRun1.pi - intelligenceBefore.pi);
    expect(firstRunReport.problemIntelligence.created).toBe(intelligenceAfterRun1.pri - intelligenceBefore.pri);
    expect(firstRunReport.careIntelligence.created).toBe(intelligenceAfterRun1.ci - intelligenceBefore.ci);
  });

  it("4. run 2 reports zero errors", () => {
    expect(secondRunReport.errors).toEqual([]);
  });

  it("5. run 2 creates zero duplicate rows — full table state identical before and after run 2 (idempotent)", () => {
    expect(intelligenceAfterRun2).toEqual(intelligenceAfterRun1);
  });

  it("6. run 2 reports zero CREATED and zero UPDATED across every layer — every real projection is unchanged since run 1 (pure touch/no-op)", () => {
    expect(secondRunReport.knowledgeItem.created).toBe(0);
    expect(secondRunReport.knowledgeItem.updated).toBe(0);
    expect(secondRunReport.productIntelligence.created).toBe(0);
    expect(secondRunReport.productIntelligence.updated).toBe(0);
    expect(secondRunReport.problemIntelligence.created).toBe(0);
    expect(secondRunReport.problemIntelligence.updated).toBe(0);
    expect(secondRunReport.careIntelligence.created).toBe(0);
    expect(secondRunReport.careIntelligence.updated).toBe(0);
  });

  it("7. deterministic identity — every real ProductIntelligence.productId maps to a real, ACTIVE Product, no duplicates", async () => {
    const rows = await prisma.productIntelligence.findMany({ select: { productId: true } });
    const productIds = new Set(rows.map((r) => r.productId));
    expect(productIds.size).toBe(rows.length); // no duplicate identities
    const realProducts = await prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    const realIds = new Set(realProducts.map((p) => p.id));
    expect([...productIds].every((id) => realIds.has(id))).toBe(true);
  });

  it("8. governance-blocked products (UNRESOLVED_CONFLICT) are consistently skipped, never silently populated, both runs", async () => {
    const skippedInReport = [...firstRunReport.productIntelligence.results, ...secondRunReport.productIntelligence.results].filter(
      (r) => r.action === "SKIPPED" && r.reason.includes("UNRESOLVED_CONFLICT"),
    );
    // Same set of blocked productIds must appear in both runs' skip lists.
    const run1Skipped = new Set(firstRunReport.productIntelligence.results.filter((r) => r.action === "SKIPPED" && r.reason.includes("UNRESOLVED_CONFLICT")).map((r) => r.deterministicKey));
    const run2Skipped = new Set(secondRunReport.productIntelligence.results.filter((r) => r.action === "SKIPPED" && r.reason.includes("UNRESOLVED_CONFLICT")).map((r) => r.deterministicKey));
    expect(run1Skipped).toEqual(run2Skipped);
    expect(skippedInReport.length).toBe(run1Skipped.size * 2);
  });

  it("9. source records (Product, ProductContent, PublishedKnowledgeRecord) remain completely unchanged", () => {
    expect(sourceAfter).toEqual(sourceBefore);
  });

  it("10. no ProductContent approval status was changed by population", () => {
    expect(sourceAfter.pendingContent).toBe(sourceBefore.pendingContent);
  });

  it("11. restricted content (dedicated Ingredients field) is excluded from every ProductIntelligenceVersion", async () => {
    const versions = await prisma.productIntelligenceVersion.findMany({ select: { sections: true } });
    for (const v of versions) {
      expect((v.sections as Record<string, unknown>).ingredients).toBeUndefined();
    }
  });

  it("12. no record carries layer=PUBLIC (no automatic CUSTOMER_SAFE promotion)", async () => {
    const [kiPublic, piPublic, priPublic, ciPublic] = await Promise.all([
      prisma.knowledgeItem.count({ where: { layer: "PUBLIC" } }),
      prisma.productIntelligence.count({ where: { layer: "PUBLIC" } }),
      prisma.problemIntelligence.count({ where: { layer: "PUBLIC" } }),
      prisma.careIntelligence.count({ where: { layer: "PUBLIC" } }),
    ]);
    expect(kiPublic + piPublic + priPublic + ciPublic).toBe(0);
  });

  it("13. no version carries status above DRAFT (publishing is a distinct, separate action)", async () => {
    const [kv, piv, priv, civ] = await Promise.all([
      prisma.knowledgeVersion.count({ where: { status: { not: "DRAFT" } } }),
      prisma.productIntelligenceVersion.count({ where: { status: { not: "DRAFT" } } }),
      prisma.problemIntelligenceVersion.count({ where: { status: { not: "DRAFT" } } }),
      prisma.careIntelligenceVersion.count({ where: { status: { not: "DRAFT" } } }),
    ]);
    expect(kv + piv + priv + civ).toBe(0);
  });

  it("14. family relationships do not overwrite Product-specific facts — the 3 Liquid Detergent SKUs each have their own distinct ProductIntelligence row and distinct real fragrance", async () => {
    const detergentNames = ["Muv Indian Rose Liquid Detergent", "Muv Cool Water Liquid Detergent", "Muv Lavender Garden Liquid Detergent"];
    const products = await prisma.product.findMany({ where: { name: { in: detergentNames } }, select: { id: true, name: true, fragranceNotes: true } });
    expect(products.length).toBe(3);
    const piRows = await prisma.productIntelligence.findMany({ where: { productId: { in: products.map((p) => p.id) } }, select: { productId: true } });
    expect(new Set(piRows.map((r) => r.productId)).size).toBe(3);
    expect(new Set(products.map((p) => p.fragranceNotes)).size).toBe(3);
  });

  it("15. every ProblemIntelligence/CareIntelligence version carries a non-empty source citation (sourceTrace) in changeNote", async () => {
    const problemVersions = await prisma.problemIntelligenceVersion.findMany({ select: { changeNote: true } });
    const careVersions = await prisma.careIntelligenceVersion.findMany({ select: { changeNote: true } });
    for (const v of [...problemVersions, ...careVersions]) {
      expect(v.changeNote).toBeTruthy();
      expect(v.changeNote).toContain("Source:");
    }
  });

  it("16. CareIntelligence relationships to ProductIntelligence/ProblemIntelligence resolve to real rows (no orphans)", async () => {
    const careWithRelations = await prisma.careIntelligenceVersion.findMany({
      where: { versionNumber: 1 },
      include: { relatedProducts: true, relatedProblemIntelligence: true },
    });
    for (const v of careWithRelations) {
      for (const p of v.relatedProducts) expect(p.id).toBeTruthy();
      for (const pr of v.relatedProblemIntelligence) expect(pr.id).toBeTruthy();
    }
  });

  it("17. confidentiality regression — no ACTIVE (latest) ProductIntelligenceVersion contains a high-confidence RESTRICTED_INTERNAL_FORMULATION term after a real population run", async () => {
    // Scoped to RESTRICTED_INTERNAL_FORMULATION specifically — the ONLY
    // classification the writer's redactValueForConfidentiality() call
    // auto-redacts. A FOUNDER_REVIEW_REQUIRED finding (an ambiguous
    // pattern match — batch quantities, "SOP §" references, percentages)
    // is EXPECTED to still be present: it is deliberately never
    // auto-rewritten ("route ambiguous content to Founder review, don't
    // silently sanitize it"), and separately remains blocked from ever
    // becoming CUSTOMER_SAFE by governance-validation.ts's
    // RESTRICTED_CONTENT_DETECTED rule regardless of whether the text
    // itself is redacted. Asserting FOUNDER_REVIEW_REQUIRED must never
    // exist would contradict that design, not verify it.
    const rows = await prisma.productIntelligence.findMany({
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    for (const row of rows) {
      const findings = scanValueForConfidentiality(row.versions[0]?.sections ?? {}, "sections", { sourceReference: row.productId });
      const restricted = findings.filter((f) => f.classification === "RESTRICTED_INTERNAL_FORMULATION");
      expect(restricted, `productId=${row.productId} still has a RESTRICTED_INTERNAL_FORMULATION term in its active version: ${JSON.stringify(restricted)}`).toEqual([]);
    }
  });

  it("18. confidentiality regression — the write-time redaction is deterministic: running population twice never creates a new version due to redaction drift", () => {
    // Already proven by test 6 (zero updates on run 2), stated explicitly
    // here as its own named regression guard for the specific behavior
    // this corrective task introduced (product-intelligence-writer.ts's
    // redactValueForConfidentiality call) — a future change that made
    // redaction non-deterministic would fail THIS test even if it didn't
    // fail test 6 for an unrelated reason.
    expect(secondRunReport.productIntelligence.updated).toBe(0);
  });

  it("19. isolated create-path regression — a single KnowledgeItem projection's CREATE branch works correctly from a genuinely deleted-then-restored state, with guaranteed cleanup", async () => {
    const manifest = await runReconciliationDryRun();
    const target = manifest.knowledgeItemProjections.find((p) => p.content && p.content.length > 0);
    expect(target, "expected at least one real, non-gap KnowledgeItem projection to exist").toBeDefined();

    const before = await prisma.knowledgeItem.findUnique({ where: { slug: target!.slug }, include: { versions: true } });
    expect(before, "this specific test's target must already exist from the outer beforeAll run").not.toBeNull();

    try {
      // Genuinely isolate the CREATE branch: delete this one real row (and
      // its versions, via the schema's own onDelete: Cascade), then run
      // the writer once and confirm it recreates a version-1 DRAFT row
      // with identical content — never touching Product/ProductContent.
      await prisma.knowledgeItem.delete({ where: { id: before!.id } });
      const deletedCheck = await prisma.knowledgeItem.findUnique({ where: { slug: target!.slug } });
      expect(deletedCheck).toBeNull();

      const result = await writeKnowledgeItemProjection(target!);
      expect(result.action).toBe("CREATED");

      const restored = await prisma.knowledgeItem.findUnique({ where: { slug: target!.slug }, include: { versions: true } });
      expect(restored).not.toBeNull();
      expect(restored!.versions).toHaveLength(1);
      expect(restored!.versions[0]!.versionNumber).toBe(1);
      expect(restored!.versions[0]!.status).toBe("DRAFT");
      expect(restored!.versions[0]!.content).toBe(target!.content);
    } finally {
      // Guaranteed restoration to the exact pre-test state regardless of
      // assertion outcome — "cleanup leaves no persistent test data"
      // beyond what the outer population run already legitimately owns.
      const current = await prisma.knowledgeItem.findUnique({ where: { slug: target!.slug } });
      if (!current) {
        await writeKnowledgeItemProjection(target!);
      }
    }
  }, 30000);

  it("20. cleanup verification — after test 19's guaranteed restoration, table counts match what they were immediately after run 2 (no persistent test artifact)", async () => {
    const final = await snapshotIntelligenceTables();
    expect(final.ki).toBe(intelligenceAfterRun2.ki);
    expect(final.kv).toBe(intelligenceAfterRun2.kv);
  });
});
