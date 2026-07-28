import { Prisma } from '@prisma/client';

import { PricingService } from './pricing.service';

describe('PricingService.computeRepaymentBreakdown', () => {
  const service = new PricingService();

  it('computes a basic breakdown correctly', () => {
    const result = service.computeRepaymentBreakdown(5000, {
      snapshotAnnualInterestRate: 36,
      snapshotInterestFreeThreshold: 500,
      snapshotProcessingFeeRate: 0.02,
      snapshotGstRate: 0.18,
      snapshotInterestDays: 19,
    });

    expect(result.interestFreeAmount).toBe(500);
    expect(result.interestBearingAmount).toBe(4500);
    expect(result.totalAmount).toBeCloseTo(
      5000 + result.interestAmount + result.processingFee + result.gstAmount,
      2,
    );
  });

  it('matches exact Decimal arithmetic across a wide sweep of realistic inputs (regression: float math previously drifted by ₹0.01 in ~0.4% of cases)', () => {
    const service = new PricingService();
    let mismatches = 0;

    for (let amount = 1000; amount <= 20000; amount += 733) {
      for (const rate of [12, 18, 24, 30, 36]) {
        for (const days of [1, 3, 7, 15, 19, 28, 31]) {
          for (const feeRate of [0.01, 0.0175, 0.02, 0.025]) {
            const snapshot = {
              snapshotAnnualInterestRate: rate,
              snapshotInterestFreeThreshold: 500,
              snapshotProcessingFeeRate: feeRate,
              snapshotGstRate: 0.18,
              snapshotInterestDays: days,
            };

            const result = service.computeRepaymentBreakdown(amount, snapshot);

            // Independent oracle computed directly with Prisma's Decimal class.
            const principal = new Prisma.Decimal(amount);
            const interestFreeAmount = Prisma.Decimal.min(
              principal,
              snapshot.snapshotInterestFreeThreshold,
            ).toDecimalPlaces(2);
            const interestBearingAmount = principal
              .minus(interestFreeAmount)
              .toDecimalPlaces(2);
            const interestAmount = interestBearingAmount
              .times(rate)
              .dividedBy(100)
              .times(days)
              .dividedBy(365)
              .toDecimalPlaces(2);
            const processingFee = principal
              .times(feeRate)
              .toDecimalPlaces(2);
            const gstAmount = interestAmount
              .plus(processingFee)
              .times(0.18)
              .toDecimalPlaces(2);
            const totalAmount = principal
              .plus(interestAmount)
              .plus(processingFee)
              .plus(gstAmount)
              .toDecimalPlaces(2);

            if (
              result.interestAmount !== interestAmount.toNumber() ||
              result.processingFee !== processingFee.toNumber() ||
              result.gstAmount !== gstAmount.toNumber() ||
              result.totalAmount !== totalAmount.toNumber()
            ) {
              mismatches++;
            }
          }
        }
      }
    }

    expect(mismatches).toBe(0);
  });
});
