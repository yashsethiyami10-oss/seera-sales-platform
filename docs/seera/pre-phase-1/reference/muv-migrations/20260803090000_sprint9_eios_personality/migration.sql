-- MUV AI Engineering Execution — Sprint 9: EIOS Runtime.
-- Purely additive: one new nullable-by-default JSONB column on
-- AiAgentDefinition (personalityProfile), used by lib/eios/personality.ts's
-- composePersonality(). No existing table/column/index dropped.
--
-- NOTE: `prisma migrate diff` also emitted `DROP INDEX
-- "knowledge_embeddings_embedding_hnsw_idx"` ahead of this statement —
-- deliberately excluded, same known false positive documented in
-- migrations 20260801200000, 20260801241000, and 20260802100000 (Prisma's
-- schema DSL cannot express `USING hnsw`, so `migrate diff` always proposes
-- dropping that raw-SQL-created index whenever anything else in the schema
-- changes, even though nothing about it actually changed).

-- AlterTable
ALTER TABLE "ai_agent_definitions" ADD COLUMN     "personalityProfile" JSONB NOT NULL DEFAULT '{}';
