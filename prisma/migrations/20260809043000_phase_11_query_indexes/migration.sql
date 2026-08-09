-- Phase 11 guarded performance closure: additive, reversible read-path indexes only.
CREATE INDEX "seera_retailers_distributorId_createdAt_idx" ON "seera_retailers"("distributorId", "createdAt");
CREATE INDEX "seera_retailers_salespersonId_createdAt_idx" ON "seera_retailers"("salespersonId", "createdAt");
CREATE INDEX "seera_visits_checkedInAt_idx" ON "seera_visits"("checkedInAt");
CREATE INDEX "seera_sales_orders_createdAt_idx" ON "seera_sales_orders"("createdAt");
CREATE INDEX "seera_sales_orders_salespersonId_createdAt_idx" ON "seera_sales_orders"("salespersonId", "createdAt");
CREATE INDEX "seera_sales_orders_buyerPartnerId_createdAt_idx" ON "seera_sales_orders"("buyerPartnerId", "createdAt");
CREATE INDEX "seera_sales_orders_sellerPartnerId_createdAt_idx" ON "seera_sales_orders"("sellerPartnerId", "createdAt");
CREATE INDEX "seera_inventory_movements_occurredAt_idx" ON "seera_inventory_movements"("occurredAt");
CREATE INDEX "seera_targets_periodStart_periodEnd_idx" ON "seera_targets"("periodStart", "periodEnd");
CREATE INDEX "seera_collection_entries_collectedAt_idx" ON "seera_collection_entries"("collectedAt");
