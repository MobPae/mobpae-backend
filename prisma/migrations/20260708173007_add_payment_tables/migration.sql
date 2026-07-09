/*
  Warnings:

  - You are about to drop the column `couponCode` on the `memberships` table. All the data in the column will be lost.
  - You are about to drop the column `discountAmount` on the `memberships` table. All the data in the column will be lost.
  - You are about to drop the column `paymentReference` on the `memberships` table. All the data in the column will be lost.
  - You are about to drop the column `paymentScreenshot` on the `memberships` table. All the data in the column will be lost.
  - You are about to drop the column `verifiedAt` on the `memberships` table. All the data in the column will be lost.
  - You are about to drop the column `verifiedBy` on the `memberships` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[payment_order_id]` on the table `memberships` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'ATTEMPTED', 'CAPTURED', 'FAILED', 'EXPIRED', 'REFUNDED');

-- AlterTable
ALTER TABLE "memberships" DROP COLUMN "couponCode",
DROP COLUMN "discountAmount",
DROP COLUMN "paymentReference",
DROP COLUMN "paymentScreenshot",
DROP COLUMN "verifiedAt",
DROP COLUMN "verifiedBy",
ADD COLUMN     "amount_paid" DECIMAL(12,2),
ADD COLUMN     "coupon_code" TEXT,
ADD COLUMN     "discount_amount" DECIMAL(12,2),
ADD COLUMN     "payment_order_id" TEXT,
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by" TEXT;

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'RAZORPAY',
    "provider_order_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "employee_id" TEXT NOT NULL,
    "plan_key" TEXT NOT NULL,
    "coupon_code" TEXT,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "notes" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "provider_signature" TEXT,
    "event_type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT,
    "error_code" TEXT,
    "error_description" TEXT,
    "raw_payload" JSONB,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_provider_order_id_key" ON "payment_orders"("provider_order_id");

-- CreateIndex
CREATE INDEX "payment_orders_employee_id_idx" ON "payment_orders"("employee_id");

-- CreateIndex
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");

-- CreateIndex
CREATE INDEX "payment_orders_provider_order_id_idx" ON "payment_orders"("provider_order_id");

-- CreateIndex
CREATE INDEX "payment_events_order_id_idx" ON "payment_events"("order_id");

-- CreateIndex
CREATE INDEX "payment_events_provider_payment_id_idx" ON "payment_events"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_payment_order_id_key" ON "memberships"("payment_order_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_plan_key_fkey" FOREIGN KEY ("plan_key") REFERENCES "membership_plan_configs"("plan_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
