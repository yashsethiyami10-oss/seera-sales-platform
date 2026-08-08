-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3C, independent-audit
-- repair pass. Additive only; does not edit the already-applied
-- 20260727180000_..._stageb_expense_banking migration.
--
-- The original `finance_reject_completed_session_mutation()` (installed by
-- 20260727180000_...) protected a COMPLETED `finance_reconciliation_sessions`
-- row via an enumerated list of 8 named columns — the same class of gap
-- that a Stage A runtime test had already caught and fixed once before
-- (20260727150100_..._stagea_immutability_fix), for the same underlying
-- reason: an enumerated allowlist is fragile, and this one's enumeration
-- omitted `organizationKey` entirely. A direct
-- `UPDATE finance_reconciliation_sessions SET "organizationKey" = ...`
-- against a completed session would not have raised an exception.
--
-- Replaced with a deny-by-default whole-row comparison, matching the
-- pattern already used by every other conditional-immutability trigger in
-- this Part (posted journals, issued invoices, submitted expense claims).
-- No business field is permitted to change once a session is COMPLETED —
-- verified against every Business Service in lib/enterprise-finance/
-- banking-service.ts: nothing ever calls
-- `financeReconciliationSession.update(...)` on an already-completed
-- session, so there is no legitimate post-completion write to except.
-- `version`/`updatedAt` are Prisma bookkeeping columns that would only
-- ever change as a side effect of a real business-field write, which this
-- trigger already blocks — so, unlike the posted-journal trigger (which
-- must still permit its own single back-reference write), this one needs
-- no exceptions at all. This also means any column added to this table in
-- the future is automatically protected without this trigger needing to
-- be touched again.

CREATE OR REPLACE FUNCTION finance_reject_completed_session_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'COMPLETED' THEN
      RAISE EXCEPTION 'A completed reconciliation session cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'COMPLETED' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      RAISE EXCEPTION 'A completed reconciliation session is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself (name, table, timing, function) is unchanged — only
-- the function body above was replaced via CREATE OR REPLACE, so no
-- DROP/CREATE TRIGGER is needed here.
