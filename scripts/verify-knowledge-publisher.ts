import { runPublisher } from "../lib/knowledge-publisher";
import { validateKnowledgeObjects } from "../lib/knowledge-publisher/validate";
import { normalizeKnowledgeObject } from "../lib/knowledge-publisher/normalize";
import { computePublishPlan } from "../lib/knowledge-publisher/diff";
import { applyPublishPlan } from "../lib/knowledge-publisher/write";
import { embedPublishedRecord } from "../lib/knowledge-publisher/embeddings";
import { prisma } from "../lib/prisma";
import type { DiscoveredKnowledgeObject } from "../lib/knowledge-publisher/discover";
import type { NormalizedKnowledgeCandidate } from "../lib/knowledge-publisher/types";
import type { PublishPlan } from "../lib/knowledge-publisher/diff";

/**
 * MUV Knowledge Publisher™ — permanent verification (Phase 5.2.1, Task 4).
 *
 * Promoted from one-off scratchpad scripts run during Phase 5.2 into a
 * committed, repeatable script, following this repo's own established
 * `scripts/verify-*.ts` convention (see `verify-stage6d-knowledge-
 * integration.ts` for precedent) rather than the newer Vitest suite
 * (`__tests__/**`): that suite's `test-setup.ts` derives its isolated
 * test-database name via `DATABASE_URL.replace(/\/muv(\?|$)/, "/muv_test$1")`,
 * which does not match this environment's real database name
 * ("neondb", not "muv") — confirmed by actually running
 * `npx vitest run __tests__/muv-ai/diagnostics.test.ts`, which fails at
 * setup with "DATABASE_URL did not contain the expected '/muv' database
 * name," for EVERY existing test file, not just new ones. That is a
 * pre-existing environment issue unrelated to Phase 5.2.1's scope; fixing
 * shared cross-domain test infrastructure was not part of this task, so
 * this script uses the still-functional `scripts/verify-*.ts` convention
 * instead. Whoever fixes `test-setup.ts` later can port this file's
 * checks into `__tests__/knowledge-publisher/*.test.ts` largely as-is.
 *
 * Run: `npx tsx scripts/verify-knowledge-publisher.ts` (or
 * `npm run verify:knowledge-publisher`).
 *
 * Covers every scenario Task 4 lists: publish, rollback, archive, revive,
 * idempotency, duplicate IDs, approval validation, transaction rollback,
 * embedding generation — plus a real dry-run against all real Knowledge
 * Objects and malformed-object rejection.
 *
 * Destructive/edge-case checks use a synthetic, clearly-prefixed
 * `TEST_DOMAIN_SYNTHETIC` domain and are cleaned up at the end — the one
 * real, full live publish is the actual intended production operation
 * (idempotent by construction), never reverted.
 */

let passed = 0;
let failed = 0;
const check = (condition: boolean, name: string, extra?: unknown) => {
  if (condition) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
};

const TEST_DOMAIN = "TEST_DOMAIN_SYNTHETIC";

function fakeKO(overrides: Partial<DiscoveredKnowledgeObject>): DiscoveredKnowledgeObject {
  return {
    koid: "KO-TEST-001",
    title: "Test KO",
    domainFactory: "PRODUCT_KF",
    category: "Test",
    content: "Some real content.",
    fields: {},
    relationships: [],
    approvalTier: "APPROVED",
    isGapRecord: false,
    sourceFile: "/fake/path.md",
    relativeSourcePath: "docs/knowledge-factory/fake.md",
    ...overrides,
  };
}

function syntheticCandidate(overrides: Partial<NormalizedKnowledgeCandidate>): NormalizedKnowledgeCandidate {
  return {
    sourceId: `${TEST_DOMAIN}:KO-SYNTH-001`,
    koid: "KO-SYNTH-001",
    domain: TEST_DOMAIN,
    title: "Synthetic test KO",
    content: "Original synthetic content.",
    sourcePath: "test/synthetic.md",
    productId: null,
    category: null,
    approvalStatus: "APPROVED",
    publicationStatus: "PUBLISHED",
    accessLayer: "INTERNAL",
    contentHash: "hash-v1",
    isGapRecord: false,
    escalationRequired: false,
    relationships: [],
    rawFields: {},
    locale: "en",
    ...overrides,
  };
}

async function cleanupSynthetic() {
  await prisma.publishedKnowledgeRecord.deleteMany({ where: { domain: { startsWith: "TEST_DOMAIN" } } });
  await prisma.knowledgeEmbedding.deleteMany({ where: { targetType: "PublishedKnowledgeRecord", targetId: { startsWith: `${TEST_DOMAIN}:` } } });
}

/**
 * Root-cause fix for a real bug found while running this suite:
 * `computePublishPlan()` given a deliberately narrow, synthetic-only
 * candidate list (to isolate one scenario) correctly computes `toArchive`
 * as "every existing row NOT in that list" — which means every REAL row
 * too, since none of them are in a 1-item synthetic candidate set. That
 * is exactly correct behavior for `computePublishPlan` itself (it has no
 * way to know the caller only meant to test one row); the bug was in an
 * earlier version of THIS script, which applied that plan unfiltered and
 * archived all 1,043 real rows as a side effect of testing revive-from-
 * archive for one synthetic row. Every place below that applies a plan
 * computed from a narrow candidate list now scopes it to synthetic rows
 * only, first.
 */
function scopeToSynthetic(plan: PublishPlan): PublishPlan {
  const isSynthetic = (sourceId: string) => sourceId.startsWith(`${TEST_DOMAIN}:`);
  return {
    toInsert: plan.toInsert.filter((c) => isSynthetic(c.sourceId)),
    toUpdate: plan.toUpdate.filter((u) => isSynthetic(u.candidate.sourceId)),
    toTouch: [], // never touch a real row's lastSeenAt from an isolated synthetic-only plan
    toArchive: plan.toArchive.filter((r) => isSynthetic(r.sourceId)),
  };
}

async function main() {
  await cleanupSynthetic(); // in case a previous aborted run left test rows behind

  // ---- Dry-run against all real Knowledge Objects ----
  const dry = await runPublisher({ dryRun: true });
  console.log(`\nDRY RUN: discovered=${dry.discovered} valid=${dry.validCount} rejected=${dry.rejected} warnings=${dry.warnings.length}`);
  check(dry.mode === "DRY_RUN", "dry-run: mode is DRY_RUN");
  check(dry.embeddingsCreated === 0 && dry.embeddingsUpdated === 0, "dry-run: zero embeddings (writes nothing)");
  check(dry.rejected < dry.discovered * 0.25, "dry-run: rejected is a plausible fraction of discovered (not a validator regression)", dry.rejected);
  const realDupErrors = dry.errors.filter((e) => e.message.includes("Duplicate"));
  check(realDupErrors.length === 0, "duplicate-ID: zero real duplicates in the actual Knowledge Factory", realDupErrors);

  // ---- Duplicate-ID rejection (synthetic) ----
  const dupSet = [
    fakeKO({ koid: "KO-DUP-001", sourceFile: "/fake/a.md", relativeSourcePath: "a.md" }),
    fakeKO({ koid: "KO-DUP-001", sourceFile: "/fake/b.md", relativeSourcePath: "b.md" }),
    fakeKO({ koid: "KO-UNIQUE-001", sourceFile: "/fake/c.md", relativeSourcePath: "c.md" }),
  ];
  const dupResult = validateKnowledgeObjects(dupSet);
  check(dupResult.valid.filter((v) => v.koid === "KO-DUP-001").length === 0, "duplicate-ID: both duplicate copies rejected");
  check(dupResult.valid.some((v) => v.koid === "KO-UNIQUE-001"), "duplicate-ID: unrelated unique record still valid");

  // ---- Approval-status validation ----
  const approvalCases: [string, string][] = [
    ["APPROVED", "PUBLISHED"],
    ["REVIEW_READY", "PENDING_REVIEW"],
    ["DRAFT", "DRAFT"],
    ["OPEN_PENDING_FOUNDER_INPUT", "PENDING_FOUNDER_INPUT"],
    ["UNKNOWN", "UNKNOWN_STATUS"],
  ];
  for (const [tier, expected] of approvalCases) {
    const normalized = normalizeKnowledgeObject(fakeKO({ approvalTier: tier as any, koid: `KO-APPROVAL-${tier}` }));
    check(normalized.publicationStatus === expected, `approval-status: ${tier} -> ${expected}`, normalized.publicationStatus);
  }
  const unknownValidation = validateKnowledgeObjects([fakeKO({ approvalTier: "UNKNOWN", koid: "KO-UNKNOWN-TEST" })]);
  check(unknownValidation.issues.some((i) => i.level === "WARNING" && i.koid === "KO-UNKNOWN-TEST"), "approval-status: UNKNOWN produces a WARNING, never silently guessed");

  // ---- Malformed-object rejection ----
  const malformedSet = [
    fakeKO({ koid: "", relativeSourcePath: "bad-koid.md" }),
    fakeKO({ title: "", koid: "KO-BAD-TITLE", relativeSourcePath: "bad-title.md" }),
    fakeKO({ domainFactory: "NOT_A_REAL_DOMAIN" as any, koid: "KO-BAD-DOMAIN", relativeSourcePath: "bad-domain.md" }),
    fakeKO({ content: "", isGapRecord: false, koid: "KO-BAD-CONTENT", relativeSourcePath: "bad-content.md" }),
    fakeKO({ approvalTier: "TOTALLY_INVALID" as any, koid: "KO-BAD-APPROVAL", relativeSourcePath: "bad-approval.md" }),
    fakeKO({ content: "", isGapRecord: true, koid: "KO-GOOD-GAP", relativeSourcePath: "gap.md" }),
  ];
  const malformedResult = validateKnowledgeObjects(malformedSet);
  check(!malformedResult.valid.some((v) => v.relativeSourcePath === "bad-koid.md"), "malformed: missing koid rejected");
  check(!malformedResult.valid.some((v) => v.koid === "KO-BAD-TITLE"), "malformed: missing title rejected");
  check(!malformedResult.valid.some((v) => v.koid === "KO-BAD-DOMAIN"), "malformed: unknown domain rejected");
  check(!malformedResult.valid.some((v) => v.koid === "KO-BAD-CONTENT"), "malformed: empty content (non-gap) rejected");
  check(!malformedResult.valid.some((v) => v.koid === "KO-BAD-APPROVAL"), "malformed: unrecognized approval tier rejected");
  check(malformedResult.valid.some((v) => v.koid === "KO-GOOD-GAP"), "malformed: legitimate gap record (empty content) is VALID");

  // ---- Real, live publish (the actual production operation) ----
  const publish1 = await runPublisher({ dryRun: false });
  console.log(`\nLIVE PUBLISH: inserted=${publish1.inserted} updated=${publish1.updated} unchanged=${publish1.unchanged} archived=${publish1.archived} embeddingsCreated=${publish1.embeddingsCreated}`);
  check(publish1.mode === "PUBLISH", "publish: mode is PUBLISH");
  const dbCountAfter1 = await prisma.publishedKnowledgeRecord.count();
  check(dbCountAfter1 >= publish1.inserted, "publish: DB row count reflects the publish", { dbCountAfter1, inserted: publish1.inserted });
  const runLog = await prisma.knowledgePublishRun.findFirst({ orderBy: { startedAt: "desc" } });
  check(runLog?.mode === "PUBLISH", "publish: a KnowledgePublishRun row was persisted");

  // ---- Idempotency: publish again immediately ----
  const publish2 = await runPublisher({ dryRun: false });
  console.log(`IDEMPOTENCY RUN: inserted=${publish2.inserted} updated=${publish2.updated} unchanged=${publish2.unchanged}`);
  check(publish2.inserted === 0, "idempotency: second run inserted 0");
  check(publish2.updated === 0, "idempotency: second run updated 0");
  check(publish2.embeddingsCreated === 0 && publish2.embeddingsUpdated === 0, "idempotency: second run created/updated 0 embeddings");
  const dbCountAfter2 = await prisma.publishedKnowledgeRecord.count();
  check(dbCountAfter2 === dbCountAfter1, "idempotency: DB row count unchanged after second run", { dbCountAfter1, dbCountAfter2 });

  // ---- Real-data regression guard ----
  // A real row's identity + status, snapshotted before any of the
  // synthetic-isolated tests below run, and re-checked after every one of
  // them — the permanent guard against the exact bug described above
  // ever silently recurring (row count alone does not catch it, since
  // archiving doesn't change how many rows exist, only their status).
  const sentinelBefore = await prisma.publishedKnowledgeRecord.findFirst({
    where: { domain: { not: { startsWith: "TEST_DOMAIN" } } },
    orderBy: { sourceId: "asc" },
  });
  if (!sentinelBefore) throw new Error("No real published record found to use as a regression sentinel — did the earlier live publish not run?");
  async function checkSentinelUnaffected(label: string) {
    const current = await prisma.publishedKnowledgeRecord.findUniqueOrThrow({ where: { id: sentinelBefore!.id } });
    check(
      current.publicationStatus === sentinelBefore!.publicationStatus && current.version === sentinelBefore!.version,
      `regression guard (${label}): real sentinel row untouched by synthetic test`,
      { before: sentinelBefore!.publicationStatus, after: current.publicationStatus }
    );
  }

  // ---- Changed-content update (synthetic, isolated) ----
  const v1 = syntheticCandidate({});
  await applyPublishPlan({ toInsert: [v1], toUpdate: [], toTouch: [], toArchive: [] }, new Date());
  const insertedRow = await prisma.publishedKnowledgeRecord.findUniqueOrThrow({ where: { sourceId: v1.sourceId } });
  check(insertedRow.version === 1, "changed-content: synthetic row inserted at version 1");
  await checkSentinelUnaffected("after synthetic insert");

  const v2 = syntheticCandidate({ content: "CHANGED synthetic content.", contentHash: "hash-v2" });
  const planAfterChange = await computePublishPlan([v2]);
  check(planAfterChange.toUpdate.length === 1 && planAfterChange.toInsert.length === 0, "changed-content: changed candidate routes to toUpdate");
  await applyPublishPlan(scopeToSynthetic(planAfterChange), new Date());
  const updatedRow = await prisma.publishedKnowledgeRecord.findUniqueOrThrow({ where: { sourceId: v1.sourceId } });
  check(updatedRow.version === 2, "changed-content: version incremented to 2", updatedRow.version);
  check(updatedRow.content === "CHANGED synthetic content.", "changed-content: content actually changed");
  await checkSentinelUnaffected("after changed-content update");

  // ---- Deleted-source archive + revive (synthetic, isolated) ----
  const planWithNoCandidates = await computePublishPlan([]);
  const ourArchiveEntry = planWithNoCandidates.toArchive.find((r) => r.sourceId === v1.sourceId);
  check(Boolean(ourArchiveEntry), "deleted-source: synthetic row appears in toArchive when absent from candidates");
  await applyPublishPlan(scopeToSynthetic(planWithNoCandidates), new Date());
  const archivedRow = await prisma.publishedKnowledgeRecord.findUniqueOrThrow({ where: { sourceId: v1.sourceId } });
  check(archivedRow.publicationStatus === "ARCHIVED", "deleted-source: publicationStatus is ARCHIVED", archivedRow.publicationStatus);
  check(archivedRow.archivedAt !== null, "deleted-source: archivedAt is set");
  check(archivedRow.content === "CHANGED synthetic content.", "deleted-source: history preserved, not hard-deleted");
  await checkSentinelUnaffected("after deleted-source archive");

  const planRevive = await computePublishPlan([v2]);
  const revivedInPlan = planRevive.toUpdate.find((u) => u.candidate.sourceId === v1.sourceId);
  check(Boolean(revivedInPlan), "revive: reappeared row routes to toUpdate even with identical content");
  await applyPublishPlan(scopeToSynthetic(planRevive), new Date());
  await checkSentinelUnaffected("after revive");
  const revivedRow = await prisma.publishedKnowledgeRecord.findUniqueOrThrow({ where: { sourceId: v1.sourceId } });
  check(revivedRow.publicationStatus === "PUBLISHED", "revive: publicationStatus restored to PUBLISHED", revivedRow.publicationStatus);
  check(revivedRow.archivedAt === null, "revive: archivedAt cleared");

  // ---- Transaction rollback safety (synthetic, guaranteed conflict) ----
  const countBeforeRollback = await prisma.publishedKnowledgeRecord.count();
  const conflictA = syntheticCandidate({ sourceId: `${TEST_DOMAIN}:KO-ROLLBACK-DUP`, koid: "KO-ROLLBACK-DUP", contentHash: "rollback-a" });
  const conflictB = syntheticCandidate({ sourceId: `${TEST_DOMAIN}:KO-ROLLBACK-DUP`, koid: "KO-ROLLBACK-DUP", contentHash: "rollback-b" });
  let threw = false;
  try {
    await applyPublishPlan({ toInsert: [conflictA, conflictB], toUpdate: [], toTouch: [], toArchive: [] }, new Date());
  } catch {
    threw = true;
  }
  check(threw, "rollback: the conflicting write threw");
  const countAfterRollback = await prisma.publishedKnowledgeRecord.count();
  check(countAfterRollback === countBeforeRollback, "rollback: no partial row was committed", { countBeforeRollback, countAfterRollback });
  const leftoverRollbackRow = await prisma.publishedKnowledgeRecord.findUnique({ where: { sourceId: `${TEST_DOMAIN}:KO-ROLLBACK-DUP` } });
  check(leftoverRollbackRow === null, "rollback: the conflicting sourceId does not exist at all");

  // ---- Embedding generation (deterministic/mock mode) ----
  const embedSourceId = `${TEST_DOMAIN}:KO-EMBED-TEST`;
  const embedOk = await embedPublishedRecord(embedSourceId, "Embed test title", "Embed test content body.");
  check(embedOk === true, "embedding: hook returns true");
  const embeddingRow = await prisma.knowledgeEmbedding.findFirst({ where: { targetType: "PublishedKnowledgeRecord", targetId: embedSourceId } });
  check(Boolean(embeddingRow), "embedding: a real KnowledgeEmbedding row was written");
  check(embeddingRow?.model === "MOCK_DETERMINISTIC_V1", "embedding: deterministic MOCK model used (no live provider configured)", embeddingRow?.model);

  // ---- Cleanup ----
  await cleanupSynthetic();
  const leftover = await prisma.publishedKnowledgeRecord.count({ where: { domain: { startsWith: "TEST_DOMAIN" } } });
  check(leftover === 0, "cleanup: no synthetic test rows remain");
  const finalRealCount = await prisma.publishedKnowledgeRecord.count();
  check(finalRealCount === dbCountAfter1, "cleanup: real published row count unaffected by synthetic tests", { finalRealCount, dbCountAfter1 });

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await cleanupSynthetic().catch(() => {});
  process.exitCode = 1;
});
