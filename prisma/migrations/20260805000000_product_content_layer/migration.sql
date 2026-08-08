-- CreateTable
CREATE TABLE "product_content" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "keyBenefits" TEXT,
    "howToUse" TEXT,
    "careInstructions" TEXT,
    "storage" TEXT,
    "safetyInformation" TEXT,
    "productHighlights" TEXT,
    "faq" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "searchKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceProvenance" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_content_productId_key" ON "product_content"("productId");

-- AddForeignKey
ALTER TABLE "product_content" ADD CONSTRAINT "product_content_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

