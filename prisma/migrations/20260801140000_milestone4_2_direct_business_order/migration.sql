-- Milestone 4.2 — Direct Business Order Workflow.
--
-- Repurposes BusinessOrderSource from the original {D2C, INSTITUTIONAL}
-- channel distinction (D2C was never actually written to any row) into an
-- explicit workflow-origin label {QUOTATION, DIRECT_LEAD}. Existing rows
-- (all currently INSTITUTIONAL, since D2C was unused) are safely backfilled
-- to QUOTATION as part of this same type swap, via an explicit CASE
-- mapping in the USING clause — NOT a naive ::text:: cast, which would fail
-- outright since neither old value name exists in the new enum.

-- AlterEnum (with explicit value remapping, not a naive cast)
BEGIN;
CREATE TYPE "BusinessOrderSource_new" AS ENUM ('QUOTATION', 'DIRECT_LEAD');
ALTER TABLE "business_orders" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "business_orders" ALTER COLUMN "source" TYPE "BusinessOrderSource_new"
  USING (
    CASE "source"::text
      WHEN 'D2C' THEN 'DIRECT_LEAD'
      WHEN 'INSTITUTIONAL' THEN 'QUOTATION'
    END
  )::"BusinessOrderSource_new";
ALTER TYPE "BusinessOrderSource" RENAME TO "BusinessOrderSource_old";
ALTER TYPE "BusinessOrderSource_new" RENAME TO "BusinessOrderSource";
DROP TYPE "BusinessOrderSource_old";
ALTER TABLE "business_orders" ALTER COLUMN "source" SET DEFAULT 'QUOTATION';
COMMIT;

-- AlterTable — quotationVersionId becomes nullable; a DIRECT_LEAD order
-- genuinely has no quotation. The existing @unique on this column is
-- untouched (Postgres treats multiple NULLs as distinct under a unique
-- index by default), so "one order per accepted quotation version" is
-- still fully enforced for QUOTATION-sourced rows.
ALTER TABLE "business_orders" ALTER COLUMN "quotationVersionId" DROP NOT NULL;

-- Partial unique index — the real, DB-enforced, concurrency-safe duplicate
-- guard for DIRECT_LEAD orders specifically. A blanket unique constraint on
-- opportunityId would incorrectly break the QUOTATION path's existing,
-- already-permitted multiplicity (one Opportunity can have several
-- InstQuotations over time, each independently capable of producing its
-- own order if accepted) — this index only applies where
-- source = 'DIRECT_LEAD', leaving that multiplicity untouched for every
-- other row. Not representable in schema.prisma (Prisma has no partial-
-- index syntax) — intentional, documented drift between the Prisma schema
-- and the live database, same tradeoff already accepted for this table's
-- number-assignment trigger.
CREATE UNIQUE INDEX "business_orders_direct_lead_opportunity_unique"
  ON "business_orders" ("opportunityId")
  WHERE "source" = 'DIRECT_LEAD' AND "opportunityId" IS NOT NULL;
