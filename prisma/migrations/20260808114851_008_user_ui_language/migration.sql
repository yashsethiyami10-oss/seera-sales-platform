-- CreateEnum
CREATE TYPE "UiLanguage" AS ENUM ('EN', 'HI');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "preferredLanguage" "UiLanguage" NOT NULL DEFAULT 'EN';
