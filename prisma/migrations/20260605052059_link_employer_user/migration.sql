/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `employers` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "employers" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "employers_userId_key" ON "employers"("userId");

-- AddForeignKey
ALTER TABLE "employers" ADD CONSTRAINT "employers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
