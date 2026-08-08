/**
 * MUV AI — Intelligence Population (Block 2B, Stage 2).
 * KnowledgeItem writer. One item per real, non-gap projection. Never sets
 * layer PUBLIC (uses the mapper's own computed `layer`, which is only ever
 * INTERNAL or CONFIDENTIAL). Every version is created DRAFT — publishing is
 * a distinct, separately-authorized action this writer never performs.
 */

import { prisma } from "@/lib/prisma";
import { computeContentHash } from "@/lib/knowledge-reconciliation/identity";
import type { KnowledgeItemProjection } from "@/lib/knowledge-reconciliation/types";
import type { LayerWriteResult } from "./types";

export async function writeKnowledgeItemProjection(projection: KnowledgeItemProjection): Promise<LayerWriteResult> {
  // Gap records carry no real content — never written, matching the
  // mapper's own "never rendered as retrievable content" rule.
  if (!projection.content) {
    return { deterministicKey: projection.deterministicKey, targetModel: "KnowledgeItem", action: "SKIPPED", recordId: null, reason: "Gap record or empty content — never written." };
  }

  const contentHash = computeContentHash({ title: projection.title, content: projection.content });

  const existing = await prisma.knowledgeItem.findUnique({
    where: { slug: projection.slug },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!existing) {
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.knowledgeItem.create({
        data: {
          slug: projection.slug,
          title: projection.title,
          fileType: projection.fileType,
          layer: projection.layer,
          productId: projection.productId,
        },
      });
      await tx.knowledgeVersion.create({
        data: {
          itemId: item.id,
          versionNumber: 1,
          content: projection.content,
          status: "DRAFT",
          changeNote: `Block 2B controlled population. Source: ${JSON.stringify(projection.provenance)}`,
        },
      });
      return item;
    }, { timeout: 15000, maxWait: 10000 });
    return { deterministicKey: projection.deterministicKey, targetModel: "KnowledgeItem", action: "CREATED", recordId: created.id, reason: "No existing row for this slug." };
  }

  const latestVersion = existing.versions[0];
  const existingHash = latestVersion ? computeContentHash({ title: existing.title, content: latestVersion.content }) : null;

  if (existingHash === contentHash) {
    return { deterministicKey: projection.deterministicKey, targetModel: "KnowledgeItem", action: "TOUCHED", recordId: existing.id, reason: "Content unchanged since last population run — no write performed." };
  }

  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
  await prisma.$transaction(async (tx) => {
    await tx.knowledgeVersion.create({
      data: {
        itemId: existing.id,
        versionNumber: nextVersionNumber,
        content: projection.content,
        status: "DRAFT",
        changeNote: `Block 2B controlled population re-run — content changed. Source: ${JSON.stringify(projection.provenance)}`,
      },
    });
  }, { timeout: 15000, maxWait: 10000 });
  return { deterministicKey: projection.deterministicKey, targetModel: "KnowledgeItem", action: "UPDATED", recordId: existing.id, reason: "Content changed — new DRAFT version created; prior versions never edited in place." };
}
