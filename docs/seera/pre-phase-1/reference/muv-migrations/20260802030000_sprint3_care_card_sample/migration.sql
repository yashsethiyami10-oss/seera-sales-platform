ALTER TABLE "orders" ADD COLUMN     "careCardIncluded" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "surpriseSampleIncluded" BOOLEAN NOT NULL DEFAULT false;
