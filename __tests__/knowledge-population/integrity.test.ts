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
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart.`);
}

import { runIntegrityChecks, type IntegrityReport } from "@/lib/knowledge-population";

/**
 * Block 2B, Stage 3 — cross-layer integrity verification. Read-only:
 * queries the four populated intelligence tables, writes nothing. Runs
 * the full check set once in `beforeAll` and asserts against the shared
 * result, rather than once per `it()` — avoids 9x redundant DB round
 * trips against a real, sometimes-latent Neon connection.
 */
describe("Block 2B, Stage 3 — Cross-Layer Integrity Checks", () => {
  let report: IntegrityReport;

  beforeAll(async () => {
    report = await runIntegrityChecks();
  }, 30000);

  it("1. no orphaned Product references across any intelligence layer", () => {
    expect(report.orphanedProductReferences).toEqual([]);
  });

  it("2. no broken cross-layer links (Problem<->Product, Care<->Problem/Product)", () => {
    expect(report.brokenCrossLayerLinks).toEqual([]);
  });

  it("3. no duplicate ProductIntelligence identities (one row per productId)", () => {
    expect(report.duplicateProductIntelligenceIdentities).toEqual([]);
  });

  it("4. every version created by population carries a sourceTrace citation", () => {
    expect(report.missingSourceTrace).toEqual([]);
  });

  it("5. every row/version carries valid governance metadata (layer + status)", () => {
    expect(report.missingGovernanceMetadata).toEqual([]);
  });

  it("6. no invalid family inheritance — every family SKU's ProductIntelligence mentions its own distinguishing marker", () => {
    expect(report.invalidFamilyInheritance).toEqual([]);
  });

  it("7. no inactive-source references (every referenced Product is currently ACTIVE)", () => {
    expect(report.inactiveSourceReferences).toEqual([]);
  });

  it("8. no conflicting, unexplained safety relationships within a single ProblemIntelligence version", () => {
    expect(report.conflictingSafetyRelationships).toEqual([]);
  });

  it("9. overall: zero total integrity findings across the real populated dataset", () => {
    expect(report.totalFindings).toBe(0);
  });
});
