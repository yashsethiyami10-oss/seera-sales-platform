/**
 * MUV AI — Intelligence Population (Block 2B, Stage 2).
 * ProblemIntelligence writer. Writes exactly the fields the Block 2A
 * mapper's `ProblemIntelligenceProjection` actually produces — this writer
 * never invents symptoms, diagnostic questions, or common-mistakes content
 * the mapper itself never derived (Block 1/2C scoped ProblemIntelligence
 * narrower than the full schema's potential; this writer respects that
 * scope rather than filling gaps).
 */

import { prisma } from "@/lib/prisma";
import { computeContentHash } from "@/lib/knowledge-reconciliation/identity";
import type { ProblemIntelligenceProjection } from "@/lib/knowledge-reconciliation/types";
import type { LayerWriteResult } from "./types";

function riskLevelFor(projection: ProblemIntelligenceProjection): "LOW" | "MODERATE" | "HIGH" | "CRITICAL" {
  return projection.safetyRisks.length > 0 ? "MODERATE" : "LOW";
}

async function writeChildRelationships(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], versionId: string, projection: ProblemIntelligenceProjection) {
  for (const rel of projection.affectedProducts) {
    await tx.problemProductRelationship.create({
      data: {
        versionId,
        productId: rel.productId,
        suitability: rel.suitability,
        confidence: rel.confidence,
        reason: "Derived by the Block 2A governed reconciliation mapper from approved ProductContent FAQ content.",
      },
    });
  }
}

export async function writeProblemIntelligenceProjection(projection: ProblemIntelligenceProjection): Promise<LayerWriteResult> {
  const contentHash = computeContentHash({
    canonicalProblem: projection.canonicalProblem,
    category: projection.category,
    affectedProducts: projection.affectedProducts,
    safetyRisks: projection.safetyRisks,
  });

  const existing = await prisma.problemIntelligence.findUnique({
    where: { slug: projection.deterministicKey },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, include: { productRelationships: true } } },
  });

  if (!existing) {
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.problemIntelligence.create({ data: { slug: projection.deterministicKey, layer: "INTERNAL" } });
      const version = await tx.problemIntelligenceVersion.create({
        data: {
          problemIntelligenceId: item.id,
          versionNumber: 1,
          status: "DRAFT",
          publicTitle: projection.canonicalProblem,
          problemCategory: projection.category,
          customerDescriptions: projection.aliases,
          tags: [],
          synonyms: [],
          searchTerms: [],
          riskLevel: riskLevelFor(projection),
          escalationRequired: projection.safetyRisks.length > 0,
          requiredDisclaimers: [],
          changeNote: `Block 2B controlled population. derivationMethod=${projection.derivationMethod}. Source: ${JSON.stringify(projection.provenance)}`,
        },
      });
      await writeChildRelationships(tx, version.id, projection);
      return item;
    }, { timeout: 15000, maxWait: 10000 });
    return { deterministicKey: projection.deterministicKey, targetModel: "ProblemIntelligence", action: "CREATED", recordId: created.id, reason: "No existing row for this slug." };
  }

  const latestVersion = existing.versions[0];
  const existingHash = latestVersion
    ? computeContentHash({
        canonicalProblem: latestVersion.publicTitle,
        category: latestVersion.problemCategory,
        affectedProducts: latestVersion.productRelationships.map((r) => ({ productId: r.productId, suitability: r.suitability, confidence: r.confidence })),
        safetyRisks: projection.safetyRisks,
      })
    : null;

  if (existingHash === contentHash) {
    return { deterministicKey: projection.deterministicKey, targetModel: "ProblemIntelligence", action: "TOUCHED", recordId: existing.id, reason: "Content unchanged since last population run — no write performed." };
  }

  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
  await prisma.$transaction(async (tx) => {
    const version = await tx.problemIntelligenceVersion.create({
      data: {
        problemIntelligenceId: existing.id,
        versionNumber: nextVersionNumber,
        status: "DRAFT",
        publicTitle: projection.canonicalProblem,
        problemCategory: projection.category,
        customerDescriptions: projection.aliases,
        tags: [],
        synonyms: [],
        searchTerms: [],
        riskLevel: riskLevelFor(projection),
        escalationRequired: projection.safetyRisks.length > 0,
        requiredDisclaimers: [],
        changeNote: `Block 2B controlled population re-run — content changed. Source: ${JSON.stringify(projection.provenance)}`,
      },
    });
    await writeChildRelationships(tx, version.id, projection);
  }, { timeout: 15000, maxWait: 10000 });
  return { deterministicKey: projection.deterministicKey, targetModel: "ProblemIntelligence", action: "UPDATED", recordId: existing.id, reason: "Content changed — new DRAFT version created with fresh child relationships." };
}
