/**
 * MUV AI — Intelligence Population (Block 2B, Stage 2).
 * ProductIntelligence writer. One row per real Product (schema's own
 * `productId @unique` is the natural key — this writer never creates a
 * second row for the same Product, matching the frozen "one authoritative
 * identity per Product" rule).
 */

import { prisma } from "@/lib/prisma";
import { computeContentHash } from "@/lib/knowledge-reconciliation/identity";
import { redactValueForConfidentiality } from "@/lib/knowledge-reconciliation/confidentiality-scanner";
import type { ProductIntelligenceProjection } from "@/lib/knowledge-reconciliation/types";
import type { LayerWriteResult } from "./types";

/** `sections` (the 15-section PIF content) and `variants` (SKU/size +
 * governed price/availability tool references) are separate top-level
 * fields on the mapper's own projection type — both are persisted into
 * the version's single `sections` JSON column (the schema's only content
 * column), under a reserved `variants` key, so pack-size/SKU identity
 * survives population instead of being silently dropped. `variants`
 * never carries a stored price/stock figure itself — only tool names —
 * so this does not create a second, staler copy of commercial data.
 *
 * Corrective Confidentiality Hardening (post-Founder-audit Finding H1):
 * before persisting, every string leaf is passed through the centralized
 * confidentiality scanner's redaction pass — high-confidence restricted
 * raw-material identifiers (never the ambiguous pattern categories) are
 * replaced with a fixed placeholder here, at write time, so this applies
 * to every future population run automatically rather than requiring a
 * one-off manual correction each time the mapper's source data changes.
 * Never silent: every redaction is returned alongside the sections so the
 * caller can record it in the version's own changeNote. */
function persistedSections(projection: ProductIntelligenceProjection): { sections: Record<string, unknown>; redactions: ReturnType<typeof redactValueForConfidentiality>["redactions"] } {
  const raw = { ...projection.sections, variants: projection.variants };
  const { value, redactions } = redactValueForConfidentiality(raw, "sections", { sourceReference: projection.productId });
  return { sections: value, redactions };
}

export async function writeProductIntelligenceProjection(projection: ProductIntelligenceProjection): Promise<LayerWriteResult> {
  const { sections: redactedSections, redactions } = persistedSections(projection);
  const contentHash = computeContentHash(redactedSections);
  const redactionNote = redactions.length > 0 ? ` Confidentiality redaction applied: ${redactions.length} restricted term(s) removed (${[...new Set(redactions.map((r) => r.normalizedTerm))].join(", ")}) — see confidentiality-scanner evidence.` : "";

  const existing = await prisma.productIntelligence.findUnique({
    where: { productId: projection.productId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!existing) {
    const created = await prisma.$transaction(async (tx) => {
      const pi = await tx.productIntelligence.create({
        data: { productId: projection.productId, layer: projection.layer },
      });
      await tx.productIntelligenceVersion.create({
        data: {
          productIntelligenceId: pi.id,
          versionNumber: 1,
          status: "DRAFT",
          // Prisma's Json input type does not accept `undefined` values on
          // optional keys — sections is already a plain, JSON-safe object
          // built by the mapper (only ever string/string[]/object values).
          sections: redactedSections as object,
          changeNote: `Block 2B controlled population. familyId=${projection.familyId ?? "none"}. Source: ${JSON.stringify(projection.provenance)}.${redactionNote}`,
        },
      });
      return pi;
    }, { timeout: 15000, maxWait: 10000 });
    return { deterministicKey: projection.deterministicKey, targetModel: "ProductIntelligence", action: "CREATED", recordId: created.id, reason: "No existing row for this productId." };
  }

  const latestVersion = existing.versions[0];
  const existingHash = latestVersion ? computeContentHash(latestVersion.sections) : null;

  if (existingHash === contentHash) {
    return { deterministicKey: projection.deterministicKey, targetModel: "ProductIntelligence", action: "TOUCHED", recordId: existing.id, reason: "Sections unchanged since last population run — no write performed." };
  }

  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
  await prisma.$transaction(async (tx) => {
    await tx.productIntelligenceVersion.create({
      data: {
        productIntelligenceId: existing.id,
        versionNumber: nextVersionNumber,
        status: "DRAFT",
        sections: redactedSections as object,
        changeNote: `Block 2B controlled population re-run — sections changed. Source: ${JSON.stringify(projection.provenance)}.${redactionNote}`,
      },
    });
  }, { timeout: 15000, maxWait: 10000 });
  return { deterministicKey: projection.deterministicKey, targetModel: "ProductIntelligence", action: "UPDATED", recordId: existing.id, reason: "Sections changed — new DRAFT version created." };
}
