-- MUV AI Engineering Execution — Sprint 1: Foundation Hardening.
-- Purely additive. No table dropped, no column altered/renamed, no data
-- migration required (verified zero existing rows in all four Version
-- tables before this migration was written).

-- AlterTable
ALTER TABLE "ai_agent_definitions" ADD COLUMN     "escalationTriggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "prohibitedTasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "restrictedTasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "successMeasures" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Partial unique indexes: at most one PUBLISHED version per item, per
-- Foundation. Not expressible in Prisma's schema DSL (no partial-index
-- syntax) — same precedent as migration 20260801090000 (Part 3D Founder
-- Workspace's "one default/active per owner" indexes). This closes the gap
-- each of these four models' own file-level comments already disclosed:
-- the invariant was previously enforced only by wrapping publish in one
-- $transaction, never by the database itself.
CREATE UNIQUE INDEX "knowledge_versions_one_published_per_item" ON "knowledge_versions"("itemId") WHERE "status" = 'PUBLISHED';

CREATE UNIQUE INDEX "product_intelligence_versions_one_published_per_item" ON "product_intelligence_versions"("productIntelligenceId") WHERE "status" = 'PUBLISHED';

CREATE UNIQUE INDEX "problem_intelligence_versions_one_published_per_item" ON "problem_intelligence_versions"("problemIntelligenceId") WHERE "status" = 'PUBLISHED';

CREATE UNIQUE INDEX "care_intelligence_versions_one_published_per_item" ON "care_intelligence_versions"("careIntelligenceId") WHERE "status" = 'PUBLISHED';
