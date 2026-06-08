/*
  Warnings:

  - You are about to drop the column `amount` on the `repayments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "repayments" DROP COLUMN "amount",
ADD COLUMN     "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "interestDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "interestRate" DECIMAL(5,2) NOT NULL DEFAULT 36,
ADD COLUMN     "principalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
