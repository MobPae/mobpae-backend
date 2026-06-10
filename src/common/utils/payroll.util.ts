export class PayrollUtil {
  /**
   * Calculate repayment amount for a salary advance.
   *
   * Example:
   * Amount = 5000
   * Interest Rate = 36% yearly
   * Request Date = 9 Jun
   * Payroll Date = 28 Jun
   *
   * Interest Days = 19
   * Interest = (5000 × 36 × 19) / (365 × 100)
   *
   * Returns:
   * - principalAmount
   * - interestAmount
   * - totalAmount
   * - interestDays
   * - dueDate
   */
  static calculateRepayment(
    amount: number,
    requestDate: Date,
    payrollCutoffDate: number,
    payrollDate: number,
    annualInterestRate: number,
  ) {
    const dueDate = this.calculateDueDate(
      requestDate,
      payrollCutoffDate,
      payrollDate,
    );

    const interestDays = Math.max(
      1,
      Math.ceil(
        (dueDate.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    const interestAmount =
      (amount * annualInterestRate * interestDays) / (365 * 100);

    const totalAmount = amount + interestAmount;

    return {
      principalAmount: Number(amount.toFixed(2)),
      interestAmount: Number(interestAmount.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      interestDays,
      dueDate,
    };
  }

  /**
   * Determine payroll recovery date.
   *
   * Example:
   * Request Date = 9 Jun
   * Payroll Date = 28
   * Result = 28 Jun
   *
   * Request Date = 27 Jun
   * Payroll Cutoff = 25
   * Payroll Date = 28
   * Result = 28 Jul
   */
  static calculateDueDate(
    requestDate: Date,
    payrollCutoffDate: number,
    payrollDate: number,
  ) {
    const dueDate = new Date(requestDate);

    if (requestDate.getDate() > payrollCutoffDate) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    dueDate.setDate(payrollDate);

    return dueDate;
  }
}
