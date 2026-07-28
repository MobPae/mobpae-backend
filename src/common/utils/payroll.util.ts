export class PayrollUtil {
  /**
   * Determine payroll recovery date.
   *
   * Rule: if the request is made ON or AFTER the cutoff date, the due date
   * falls on the NEXT month's payroll date. Otherwise it falls on the
   * current month's payroll date.
   *
   * Example:
   * Request Date = 9 Jun, Payroll Date = 28  → 28 Jun
   * Request Date = 21 Jun, Cutoff = 21, Payroll Date = 28 → 28 Jul (on cutoff = next month)
   * Request Date = 22 Jun, Cutoff = 21, Payroll Date = 28 → 28 Jul
   * Request Date = 27 Jun, Cutoff = 25, Payroll Date = 28 → 28 Jul
   */
  static calculateDueDate(
    requestDate: Date,
    payrollCutoffDate: number,
    payrollDate: number,
  ) {
    const dueDate = new Date(requestDate);

    if (requestDate.getDate() >= payrollCutoffDate) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    dueDate.setDate(payrollDate);

    return dueDate;
  }
}
