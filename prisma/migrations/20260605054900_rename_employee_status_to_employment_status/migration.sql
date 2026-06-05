/*
  Warnings:

  - You are about to drop the column `status` on the `employees` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "employees" DROP COLUMN "status",
ADD COLUMN     "employmentStatus" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE';
