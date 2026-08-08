-- MUV AI Engineering Execution — Sprint 5: Knowledge Modeling.
-- Purely additive — four new tables, no existing table touched.

-- CreateTable
CREATE TABLE "category_intelligence" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "layer" "KnowledgeLayer" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_intelligence_versions" (
    "id" TEXT NOT NULL,
    "categoryIntelligenceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ProductIntelligenceStatus" NOT NULL DEFAULT 'DRAFT',
    "sections" JSONB NOT NULL,
    "changeNote" TEXT,
    "authorId" TEXT,
    "submittedForReviewAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_intelligence_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant_intelligence" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "layer" "KnowledgeLayer" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variant_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant_intelligence_versions" (
    "id" TEXT NOT NULL,
    "productVariantIntelligenceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ProductIntelligenceStatus" NOT NULL DEFAULT 'DRAFT',
    "sections" JSONB NOT NULL,
    "changeNote" TEXT,
    "authorId" TEXT,
    "submittedForReviewAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variant_intelligence_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_intelligence_categoryId_key" ON "category_intelligence"("categoryId");

-- CreateIndex
CREATE INDEX "category_intelligence_layer_idx" ON "category_intelligence"("layer");

-- CreateIndex
CREATE INDEX "category_intelligence_versions_categoryIntelligenceId_statu_idx" ON "category_intelligence_versions"("categoryIntelligenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "category_intelligence_versions_categoryIntelligenceId_versi_key" ON "category_intelligence_versions"("categoryIntelligenceId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_intelligence_variantId_key" ON "product_variant_intelligence"("variantId");

-- CreateIndex
CREATE INDEX "product_variant_intelligence_layer_idx" ON "product_variant_intelligence"("layer");

-- CreateIndex
CREATE INDEX "product_variant_intelligence_versions_productVariantIntelli_idx" ON "product_variant_intelligence_versions"("productVariantIntelligenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_intelligence_versions_productVariantIntelli_key" ON "product_variant_intelligence_versions"("productVariantIntelligenceId", "versionNumber");

-- AddForeignKey
ALTER TABLE "category_intelligence" ADD CONSTRAINT "category_intelligence_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_intelligence_versions" ADD CONSTRAINT "category_intelligence_versions_categoryIntelligenceId_fkey" FOREIGN KEY ("categoryIntelligenceId") REFERENCES "category_intelligence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_intelligence_versions" ADD CONSTRAINT "category_intelligence_versions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_intelligence" ADD CONSTRAINT "product_variant_intelligence_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_intelligence_versions" ADD CONSTRAINT "product_variant_intelligence_versions_productVariantIntell_fkey" FOREIGN KEY ("productVariantIntelligenceId") REFERENCES "product_variant_intelligence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_intelligence_versions" ADD CONSTRAINT "product_variant_intelligence_versions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
