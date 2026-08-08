/**
 * MUV AI — Intelligence Population (Block 2B, Stage 2).
 * CareIntelligence writer. Writes exactly the fields the Block 2A mapper's
 * `CareIntelligenceProjection` produces — fields with no clear mapper
 * source (escalationTeam, escalationSla, maxWaitingPeriod, etc.) are left
 * empty rather than invented.
 */

import { prisma } from "@/lib/prisma";
import { computeContentHash } from "@/lib/knowledge-reconciliation/identity";
import type { CareIntelligenceProjection } from "@/lib/knowledge-reconciliation/types";
import type { LayerWriteResult } from "./types";

function productIdFromKey(key: string): string | null {
  return key.startsWith("pi-") ? key.slice(3) : null;
}

async function writeChildRecords(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], versionId: string, projection: CareIntelligenceProjection) {
  for (const [i, step] of projection.safeResponseSequence.entries()) {
    await tx.careAction.create({ data: { versionId, stepNumber: i + 1, description: step } });
  }
  for (const source of projection.sources) {
    await tx.careEvidenceSource.create({
      data: { versionId, source: source.label, approved: false, confidence: source.sourceApprovalStatus === "APPROVED" ? "HIGH" : "MODERATE", internalNotes: `sourceType=${source.sourceType}` },
    });
  }
}

export async function writeCareIntelligenceProjection(projection: CareIntelligenceProjection): Promise<LayerWriteResult> {
  const contentHash = computeContentHash({
    workflowName: projection.workflowName,
    trigger: projection.trigger,
    safeResponseSequence: projection.safeResponseSequence,
    precautions: projection.precautions,
    unsafeMixingWarnings: projection.unsafeMixingWarnings,
  });

  const productIds = projection.relatedProductIntelligenceKeys.map(productIdFromKey).filter((id): id is string => Boolean(id));
  const problemSlugs = projection.relatedProblemIntelligenceKeys;

  const existing = await prisma.careIntelligence.findUnique({
    where: { slug: projection.slug },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, include: { careActions: true } } },
  });

  const versionData = {
    status: "DRAFT" as const,
    title: projection.workflowName,
    category: "Care Workflow",
    situationDescription: projection.trigger,
    careObjectives: [] as string[],
    escalationRequired: projection.escalationConditions.length > 0,
    escalationReason: projection.escalationConditions.length > 0 ? projection.escalationConditions.join("; ") : null,
    communicationTone: projection.emotionalToneGuidance,
    thingsToAvoid: projection.prohibitedAdvice,
    mandatoryStatements: [
      ...(projection.unsupportedClaimHandling ? [projection.unsupportedClaimHandling] : []),
      ...(projection.nonexistentProductHandling ? [projection.nonexistentProductHandling] : []),
    ],
    optionalGuidance: projection.precautions,
    transparencyRules: [] as string[],
    applicableResolutionConditions: [] as ("RESOLVED" | "PENDING" | "WAITING_CUSTOMER" | "WAITING_TEAM" | "ESCALATED" | "CLOSED")[],
    applicableCustomerSegments: [] as string[],
  };

  if (!existing) {
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.careIntelligence.create({ data: { slug: projection.slug, layer: "INTERNAL" } });
      const version = await tx.careIntelligenceVersion.create({
        data: {
          careIntelligenceId: item.id,
          versionNumber: 1,
          ...versionData,
          changeNote: `Block 2B controlled population. derivationMethod=${projection.derivationMethod}. Source: ${JSON.stringify(projection.provenance)}`,
          ...(productIds.length > 0 ? { relatedProducts: { connect: productIds.map((id) => ({ id })) } } : {}),
          ...(problemSlugs.length > 0 ? { relatedProblemIntelligence: { connect: problemSlugs.map((slug) => ({ slug })) } } : {}),
        },
      });
      await writeChildRecords(tx, version.id, projection);
      return item;
    }, { timeout: 15000, maxWait: 10000 });
    return { deterministicKey: projection.deterministicKey, targetModel: "CareIntelligence", action: "CREATED", recordId: created.id, reason: "No existing row for this slug." };
  }

  const latestVersion = existing.versions[0];
  const existingHash = latestVersion
    ? computeContentHash({
        workflowName: latestVersion.title,
        trigger: latestVersion.situationDescription,
        safeResponseSequence: latestVersion.careActions.map((a) => a.description),
        precautions: latestVersion.optionalGuidance,
        unsafeMixingWarnings: projection.unsafeMixingWarnings,
      })
    : null;

  if (existingHash === contentHash) {
    return { deterministicKey: projection.deterministicKey, targetModel: "CareIntelligence", action: "TOUCHED", recordId: existing.id, reason: "Content unchanged since last population run — no write performed." };
  }

  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
  await prisma.$transaction(async (tx) => {
    const version = await tx.careIntelligenceVersion.create({
      data: {
        careIntelligenceId: existing.id,
        versionNumber: nextVersionNumber,
        ...versionData,
        changeNote: `Block 2B controlled population re-run — content changed. Source: ${JSON.stringify(projection.provenance)}`,
        ...(productIds.length > 0 ? { relatedProducts: { connect: productIds.map((id) => ({ id })) } } : {}),
        ...(problemSlugs.length > 0 ? { relatedProblemIntelligence: { connect: problemSlugs.map((slug) => ({ slug })) } } : {}),
      },
    });
    await writeChildRecords(tx, version.id, projection);
  }, { timeout: 15000, maxWait: 10000 });
  return { deterministicKey: projection.deterministicKey, targetModel: "CareIntelligence", action: "UPDATED", recordId: existing.id, reason: "Content changed — new DRAFT version created." };
}
