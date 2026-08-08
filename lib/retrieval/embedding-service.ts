import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * MUV Intelligence Factory V4 Gap 1 — Semantic Retrieval Layer.
 *
 * Embedding generation follows the exact provider-selection pattern
 * already established in lib/muv-ai/gateway.ts's invokeModel (query the
 * ACTIVE AiProvider, branch on provider.code === "MOCK") — reused, not
 * reinvented, just applied to embeddings instead of chat completions,
 * since no existing function has that shape.
 *
 * HONEST DISCLOSURE, not silently assumed: only the MOCK provider is
 * ACTIVE in this environment (OpenAI is seeded DISABLED/unconfigured).
 * generateEmbedding() therefore produces a deterministic, reproducible,
 * but NOT semantically meaningful vector today — it proves the storage,
 * indexing, and similarity-search MECHANISM works correctly (which is
 * this sprint's actual deliverable), not that retrieval quality is
 * production-ready. Swapping in a real embedding provider later requires
 * touching only this one function — every caller (storeEmbedding,
 * searchSimilar, and Sprint 7's orchestration plan) is unaffected.
 */

const EMBEDDING_DIMENSIONS = 1536;
const MOCK_MODEL_CODE = "MOCK_DETERMINISTIC_V1";

async function resolveActiveEmbeddingProvider() {
  return prisma.aiProvider.findFirst({ where: { status: "ACTIVE" }, orderBy: { priority: "asc" } });
}

/** Deterministic, reproducible pseudo-embedding derived from a SHA-256
 * hash of the input text, expanded to 1536 dimensions via a seeded PRNG.
 * Same text always produces the same vector — sufficient to prove
 * exact-duplicate and near-duplicate storage/retrieval mechanics, but
 * carries no real semantic meaning. Never presented as anything else. */
function mockDeterministicEmbedding(text: string): number[] {
  const hash = crypto.createHash("sha256").update(text).digest();
  const vector: number[] = [];
  let seed = hash.readUInt32BE(0);
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    vector.push((seed / 0x7fffffff) * 2 - 1); // normalized to [-1, 1]
  }
  return vector;
}

export async function generateEmbedding(text: string): Promise<{ vector: number[]; model: string }> {
  const provider = await resolveActiveEmbeddingProvider();
  if (!provider || provider.code === "MOCK") {
    return { vector: mockDeterministicEmbedding(text), model: MOCK_MODEL_CODE };
  }
  // No real embedding provider is configured in this environment today —
  // reported honestly rather than silently falling through to MOCK for a
  // provider that claims to be something else.
  throw new Error(`No embedding implementation wired for provider "${provider.code}" — only MOCK is currently supported`);
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/** Regenerates and upserts the embedding for one knowledge object — called
 * on publish (wired in Sprint 7's orchestration/pipeline hooks). */
export async function storeEmbedding(targetType: string, targetId: string, text: string) {
  const { vector, model } = await generateEmbedding(text);
  const literal = toVectorLiteral(vector);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "knowledge_embeddings" ("id", "targetType", "targetId", "model", "embedding", "generatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4::vector, now())
     ON CONFLICT ("targetType", "targetId", "model")
     DO UPDATE SET "embedding" = $4::vector, "generatedAt" = now()`,
    targetType, targetId, model, literal,
  );
  return { targetType, targetId, model };
}

export type SimilarityMatch = { targetType: string; targetId: string; distance: number };

/** Cosine-distance similarity search (the exact operator verified working
 * against this Postgres instance before this service was written). Lower
 * distance = more similar; 0 = identical. */
export async function searchSimilar(queryText: string, options: { targetTypes?: string[]; limit?: number } = {}): Promise<SimilarityMatch[]> {
  const { vector, model } = await generateEmbedding(queryText);
  const literal = toVectorLiteral(vector);
  const limit = Math.min(100, Math.max(1, options.limit ?? 10));

  if (options.targetTypes && options.targetTypes.length > 0) {
    return prisma.$queryRawUnsafe<SimilarityMatch[]>(
      `SELECT "targetType", "targetId", ("embedding" <=> $1::vector)::float8 AS distance
       FROM "knowledge_embeddings"
       WHERE "model" = $2 AND "targetType" = ANY($3::text[])
       ORDER BY "embedding" <=> $1::vector
       LIMIT $4`,
      literal, model, options.targetTypes, limit,
    );
  }
  return prisma.$queryRawUnsafe<SimilarityMatch[]>(
    `SELECT "targetType", "targetId", ("embedding" <=> $1::vector)::float8 AS distance
     FROM "knowledge_embeddings"
     WHERE "model" = $2
     ORDER BY "embedding" <=> $1::vector
     LIMIT $3`,
    literal, model, limit,
  );
}

export async function deleteEmbedding(targetType: string, targetId: string) {
  return prisma.knowledgeEmbedding.deleteMany({ where: { targetType, targetId } });
}
