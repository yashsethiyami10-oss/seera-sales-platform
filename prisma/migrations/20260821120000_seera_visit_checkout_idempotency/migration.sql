-- P0 21-Aug checkout idempotency fix. Additive, nullable column — existing rows are unaffected.
ALTER TABLE "seera_visits" ADD COLUMN "checkoutIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "seera_visits_checkoutIdempotencyKey_key"
  ON "seera_visits"("checkoutIdempotencyKey");
