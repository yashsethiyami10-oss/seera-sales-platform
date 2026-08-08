-- MUV AI Engineering Execution — Sprint 5 addendum: extend the "at most one
-- PUBLISHED version per item" invariant (Sprint 1) to the two new
-- Foundations this sprint created, at creation time rather than retrofitted
-- later. Purely additive.

CREATE UNIQUE INDEX "category_intelligence_versions_one_published_per_item" ON "category_intelligence_versions"("categoryIntelligenceId") WHERE "status" = 'PUBLISHED';

CREATE UNIQUE INDEX "product_variant_intelligence_versions_one_published_per_item" ON "product_variant_intelligence_versions"("productVariantIntelligenceId") WHERE "status" = 'PUBLISHED';
