-- MUV AI Engineering Execution — Sprint 6: Retrieval Platform.
-- Enables the pgvector extension (verified installed and functional on
-- this server before this migration was written — v0.8.6, cosine-distance
-- operator tested directly) and creates one new, additive table. No
-- existing table touched.

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "knowledge_embeddings" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_embeddings_targetType_targetId_idx" ON "knowledge_embeddings"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_embeddings_targetType_targetId_model_key" ON "knowledge_embeddings"("targetType", "targetId", "model");

-- HNSW index for cosine-distance similarity search (the operator this
-- session verified working: <=>). Chosen over IVFFlat — HNSW needs no
-- training/list-count tuning and performs well from an empty table growing
-- incrementally, matching how knowledge is actually published here (one
-- item at a time, not a bulk initial load).
CREATE INDEX "knowledge_embeddings_embedding_hnsw_idx" ON "knowledge_embeddings" USING hnsw ("embedding" vector_cosine_ops);
