export interface RepaymentCalculation {
  dueDate: Date;
  interestDays: number;
  interestAmount: number;
  totalAmount: number;
}

export class PayrollUtil {
  /**
   * Rule:
   * requestDate < cutoffDate
   *      => current payroll cycle
   *
   * requestDate >= cutoffDate
   *      => next payroll cycle
   */
  static calculateRepaymentDate(
    requestDate: Date,
    cutoffDate: number,
    payrollDate: number,
  ): {
    dueDate: Date;
    interestDays: number;
  } {
    const requestDay = requestDate.getDate();

    let dueDate: Date;

    if (requestDay < cutoffDate) {
      dueDate = new Date(
        requestDate.getFullYear(),
        requestDate.getMonth(),
        payrollDate,
      );
    } else {
      dueDate = new Date(
        requestDate.getFullYear(),
        requestDate.getMonth() + 1,
        payrollDate,
      );
    }

    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    const interestDays = Math.ceil(
      (dueDate.getTime() - requestDate.getTime()) / millisecondsPerDay,
    );

    return {
      dueDate,
      interestDays,
    };
  }

  /**
   * Simple Interest
   *
   * Formula:
   * Interest =
   * Principal × Rate × Days / 365
   */
  static calculateInterest(
    principalAmount: number,
    annualInterestRate: number,
    interestDays: number,
  ): number {
    const interest =
      principalAmount * (annualInterestRate / 100) * (interestDays / 365);

    return Number(interest.toFixed(2));
  }

  /**
   * Complete repayment calculation
   */
  static calculateRepayment(
    principalAmount: number,
    requestDate: Date,
    cutoffDate: number,
    payrollDate: number,
    annualInterestRate = 36,
  ): RepaymentCalculation {
    const { dueDate, interestDays } = this.calculateRepaymentDate(
      requestDate,
      cutoffDate,
      payrollDate,
    );

    const interestAmount = this.calculateInterest(
      principalAmount,
      annualInterestRate,
      interestDays,
    );

    const totalAmount = Number((principalAmount + interestAmount).toFixed(2));

    return {
      dueDate,
      interestDays,
      interestAmount,
      totalAmount,
    };
  }
}
