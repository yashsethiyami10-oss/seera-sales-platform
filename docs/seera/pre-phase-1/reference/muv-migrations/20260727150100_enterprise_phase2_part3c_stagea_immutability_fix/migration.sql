-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3C, Stage A immutability fix.
--
-- The `finance_reject_posted_journal_mutation()` trigger installed by
-- 20260727150000_... explicitly enumerated the columns to protect on a
-- POSTED journal (status, journalNumber, postingDate, totalDebit, ...).
-- That enumeration missed `description`, `reference`, `reason`,
-- `updatedById`, and every submitted/approved/rejected/cancelled actor and
-- timestamp column — a real gap found by this Stage A's own runtime test
-- ("rejects direct mutation ... of a posted journal"), which caught that
-- `UPDATE finance_journals SET description = 'tampered' WHERE ...` on a
-- POSTED row succeeded instead of being rejected.
--
-- Replaced with a deny-by-default comparison: the entire row (as jsonb,
-- minus the two columns a reversal/correction is allowed to populate once)
-- must be unchanged. This is CREATE OR REPLACE, not a rewrite of the
-- already-applied prior migration — the previously applied migration file
-- is left untouched, per "do not edit historical migrations."

CREATE OR REPLACE FUNCTION finance_reject_posted_journal_mutation() RETURNS trigger AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'POSTED' THEN
      RAISE EXCEPTION 'Posted financial journals cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'POSTED' THEN
    old_row := to_jsonb(OLD) - 'reversedByJournalId' - 'successorJournalId' - 'updatedAt' - 'version';
    new_row := to_jsonb(NEW) - 'reversedByJournalId' - 'successorJournalId' - 'updatedAt' - 'version';
    IF old_row IS DISTINCT FROM new_row THEN
      RAISE EXCEPTION 'Posted financial journals are immutable, except recording a single reversal/successor back-reference';
    END IF;
    IF OLD."reversedByJournalId" IS NOT NULL AND NEW."reversedByJournalId" IS DISTINCT FROM OLD."reversedByJournalId" THEN
      RAISE EXCEPTION 'A posted journal''s reversal reference cannot be changed once set';
    END IF;
    IF OLD."successorJournalId" IS NOT NULL AND NEW."successorJournalId" IS DISTINCT FROM OLD."successorJournalId" THEN
      RAISE EXCEPTION 'A posted journal''s successor reference cannot be changed once set';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
