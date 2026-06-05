/*
  Warnings:

  - Made the column `userId` on table `employers` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "employers" DROP CONSTRAINT "employers_userId_fkey";

-- AlterTable
ALTER TABLE "employers" ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "employers" ADD CONSTRAINT "employers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
