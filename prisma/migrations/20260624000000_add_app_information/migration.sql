-- CreateEnum
CREATE TYPE "AppInfoType" AS ENUM ('ABOUT', 'PRIVACY_POLICY', 'TERMS_CONDITIONS', 'HOW_IT_WORKS', 'FAQ', 'CONTACT', 'WHATS_NEW');

-- CreateTable
CREATE TABLE "app_information" (
    "id" TEXT NOT NULL,
    "type" "AppInfoType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_information_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_information_type_key" ON "app_information"("type");

-- CreateIndex
CREATE INDEX "app_information_type_isActive_idx" ON "app_information"("type", "isActive");
