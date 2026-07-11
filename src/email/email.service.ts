import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private readonly templateCache = new Map<string, string>();

  private _transporter: nodemailer.Transporter | null = null;

  private get transporter(): nodemailer.Transporter {
    if (!this._transporter) {
      const port = Number(process.env.SMTP_PORT ?? 587);
      const secure = process.env.SMTP_SECURE === 'true';
      console.log(`[EmailService] Initialising SMTP transporter — host=${process.env.SMTP_HOST} port=${port} secure=${secure} user=${process.env.SMTP_USER}`);
      this._transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        requireTLS: port === 587,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false, // Allow self-signed certs in dev; prod certs should work fine
        },
      });
    }
    return this._transporter;
  }

  /**
   * Simple template variable replacement
   */
  private replaceVariables(
    template: string,
    variables: Record<string, any>,
  ): string {
    let content = template;

    Object.entries(variables).forEach(([key, value]) => {
      content = content.replaceAll(`{{${key}}}`, String(value ?? ''));
    });

    return content;
  }

  /**
   * Build final email using layout.html
   */
  private buildEmail(
    templateName: string,
    variables: Record<string, any>,
  ): string {
    const layout = this.getTemplate('layout');
    const template = this.getTemplate(templateName);

    const body = this.replaceVariables(template, variables);

    return this.replaceVariables(layout, {
      title: variables.title ?? 'MobPae',
      year: new Date().getFullYear(),
      content: body,
    });
  }

  private getTemplate(templateName: string): string {
    const cachedTemplate = this.templateCache.get(templateName);

    if (cachedTemplate) {
      return cachedTemplate;
    }

    const templatePath = path.join(
      process.cwd(),
      `src/email/templates/${templateName}.html`,
    );
    const template = fs.readFileSync(templatePath, 'utf8');

    this.templateCache.set(templateName, template);

    return template;
  }

  async sendEmail(to: string, subject: string, html: string) {
    console.log(`[EmailService] Sending email — to=${to} subject="${subject}"`);
    try {
      const info = await this.transporter.sendMail({
        from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM}>`,
        to,
        subject,
        html,
      });
      console.log(`[EmailService] Sent — messageId=${info.messageId} accepted=${JSON.stringify(info.accepted)}`);
      return {
        messageId: info.messageId,
        accepted: info.accepted,
      };
    } catch (err) {
      console.error(`[EmailService] FAILED to send email to ${to} — subject="${subject}"`, err);
      throw err;
    }
  }

  private async sendTemplateEmail(
    to: string,
    subject: string,
    templateName: string,
    variables: Record<string, any>,
  ) {
    const html = this.buildEmail(templateName, variables);

    return this.sendEmail(to, subject, html);
  }

  async sendEmployerEnquiryEmail(data: {
    to: string;
    companyName: string;
    contactPerson: string;
    employeeCount: number;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Thank you for your interest in MobPae',
      'employer-enquiry',
      {
        title: 'Employer Enquiry Received',
        companyName: data.companyName,
        contactPerson: data.contactPerson,
        employeeCount: data.employeeCount,
      },
    );
  }

  async sendEmployerApprovedEmail(data: {
    to: string;
    companyName: string;
    loginEmail: string;
    temporaryPassword: string;
    loginUrl: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Your MobPae Employer Account is Approved',
      'employer-approved',
      {
        title: 'Employer Account Approved',
        companyName: data.companyName,
        loginEmail: data.loginEmail,
        temporaryPassword: data.temporaryPassword,
        loginUrl: data.loginUrl,
      },
    );
  }

  async sendEmployeeCreatedEmail(data: {
    to: string;
    employeeName: string;
    employerName: string;
    loginEmail: string;
    temporaryPassword: string;
    loginUrl: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Your MobPae Employee Account is Ready',
      'employee-created',
      {
        title: 'Employee Account Ready',
        employeeName: data.employeeName,
        employerName: data.employerName,
        loginEmail: data.loginEmail,
        temporaryPassword: data.temporaryPassword,
        loginUrl: data.loginUrl,
      },
    );
  }

  async sendKycApprovedEmail(data: {
    to: string;
    employeeName: string;
    documentType: string;
    approvedDate: Date;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'KYC Verification Completed',
      'kyc-approved',
      {
        title: 'KYC Approved',
        employeeName: data.employeeName,
        documentType: data.documentType,
        approvedDate: this.formatDate(data.approvedDate),
      },
    );
  }

  async sendSalaryRequestSubmittedEmail(data: {
    to: string;
    employeeName: string;
    amount: number;
    requestDate: Date;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Salary Advance Request Submitted',
      'salary-request-submitted',
      {
        title: 'Salary Request Submitted',
        employeeName: data.employeeName,
        amount: this.formatCurrency(data.amount),
        requestDate: this.formatDate(data.requestDate),
      },
    );
  }

  async sendSalaryRequestApprovedEmail(data: {
    to: string;
    employeeName: string;
    amount: number;
    approvedDate: Date;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Salary Advance Request Approved',
      'salary-request-approved',
      {
        title: 'Salary Request Approved',
        employeeName: data.employeeName,
        amount: this.formatCurrency(data.amount),
        approvedDate: this.formatDate(data.approvedDate),
      },
    );
  }

  async sendAwaitingMembershipPaymentEmail(data: {
    to: string;
    employeeName: string;
    amount: number;
    approvedDate: Date;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Action Required: Complete Your MobPae Membership',
      'salary-request-approved',
      {
        title: 'Action Required: Membership Payment',
        employeeName: data.employeeName,
        amount: this.formatCurrency(data.amount),
        approvedDate: this.formatDate(data.approvedDate),
        message:
          'Your salary advance request has been approved by your employer. To proceed with disbursal, please complete your MobPae membership payment through the app.',
      },
    );
  }

  async sendDisbursalSuccessfulEmail(data: {
    to: string;
    employeeName: string;
    disbursedAmount: number;
    disbursalDate: Date;
    repaymentDate?: Date;
    referenceNumber?: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Salary Advance Successfully Disbursed',
      'disbursal-successful',
      {
        title: 'Disbursal Successful',
        employeeName: data.employeeName,
        disbursedAmount: this.formatCurrency(data.disbursedAmount),
        disbursalDate: this.formatDate(data.disbursalDate),
        repaymentDate: data.repaymentDate
          ? this.formatDate(data.repaymentDate)
          : '-',

        referenceNumber: data.referenceNumber ?? '-',
      },
    );
  }

  async sendSettlementReportEmail(data: {
    to: string;
    companyName: string;
    settlementNumber: string;
    outstandingAmount: number;
    settlementId: string;
    recoveries?: Array<{
      employeeName: string;
      employeeCode?: string | null;
      loanApplicationNumber: string;
      principalAmount: number;
      interestAmount: number;
      totalAmount: number;
    }>;
  }) {
    const recoveryRows = data.recoveries?.length
      ? data.recoveries
          .map(
            (recovery) => `
              <tr>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">
                  <strong>${this.escapeHtml(recovery.employeeName)}</strong><br />
                  <span style="color: #6b7280; font-size: 12px;">${this.escapeHtml(
                    recovery.employeeCode ?? '-',
                  )}</span>
                </td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${this.escapeHtml(
                  recovery.loanApplicationNumber,
                )}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${this.formatCurrency(
                  recovery.principalAmount,
                )}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${this.formatCurrency(
                  recovery.interestAmount,
                )}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;"><strong>${this.formatCurrency(
                  recovery.totalAmount,
                )}</strong></td>
              </tr>`,
          )
          .join('')
      : `
              <tr>
                <td colspan="5" style="padding: 12px 8px; color: #6b7280;">No salary deductions linked to this settlement.</td>
              </tr>`;

    return this.sendTemplateEmail(
      data.to,
      'MobPae Settlement Report',
      'settlement-report',
      {
        title: 'Settlement Report',
        companyName: data.companyName,
        settlementNumber: data.settlementNumber,
        outstandingAmount: this.formatCurrency(data.outstandingAmount),
        settlementId: data.settlementId,
        recoveryRows,
      },
    );
  }

  async sendForgotPasswordEmail(data: {
    to: string;
    name: string;
    resetUrl: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Reset Your MobPae Password',
      'forgot-password',
      {
        title: 'Reset Password',
        name: data.name,
        resetUrl: data.resetUrl,
      },
    );
  }

  async sendPasswordChangedEmail(data: { to: string; name: string }) {
    return this.sendTemplateEmail(
      data.to,
      'Password Changed Successfully',
      'password-changed',
      {
        title: 'Password Changed',
        name: data.name,
      },
    );
  }

  async sendSalaryRequestRejectedEmail(data: {
    to: string;
    employeeName: string;
    amount: number;
    requestDate: Date;
    remarks: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Salary Advance Request Not Approved',
      'salary-request-rejected',
      {
        title: 'Salary Request Rejected',
        employeeName: data.employeeName,
        amount: this.formatCurrency(data.amount),
        requestDate: this.formatDate(data.requestDate),
        remarks: data.remarks,
      },
    );
  }

  async sendRepaymentPaidEmail(data: {
    to: string;
    employeeName: string;
    totalAmount: number;
    paidDate: Date;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Repayment Completed – MobPae',
      'repayment-paid',
      {
        title: 'Repayment Completed',
        employeeName: data.employeeName,
        totalAmount: this.formatCurrency(data.totalAmount),
        paidDate: this.formatDate(data.paidDate),
      },
    );
  }

  async sendKycRejectedEmail(data: {
    to: string;
    employeeName: string;
    documentType: string;
    reason?: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'KYC Document Could Not Be Verified',
      'kyc-rejected',
      {
        title: 'KYC Rejected',
        employeeName: data.employeeName,
        documentType: data.documentType,
        reason: data.reason ?? 'Document unclear or invalid.',
      },
    );
  }

  async sendBankAccountVerifiedEmail(data: {
    to: string;
    employeeName: string;
    accountHolder: string;
    bankName?: string;
    maskedAccount: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Bank Account Verified – MobPae',
      'bank-account-verified',
      {
        title: 'Bank Account Verified',
        employeeName: data.employeeName,
        accountHolder: data.accountHolder,
        bankName: data.bankName ?? '-',
        maskedAccount: data.maskedAccount,
      },
    );
  }

  async sendBankAccountRejectedEmail(data: {
    to: string;
    employeeName: string;
    maskedAccount: string;
    reason?: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Bank Account Verification Failed – MobPae',
      'bank-account-rejected',
      {
        title: 'Bank Account Rejected',
        employeeName: data.employeeName,
        maskedAccount: data.maskedAccount,
        reason: data.reason ?? 'Details could not be verified.',
      },
    );
  }

  async sendMembershipApprovedEmail(data: {
    to: string;
    employeeName: string;
    plan: string;
    startDate: Date;
    endDate: Date;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Your MobPae Membership is Active',
      'membership-approved',
      {
        title: 'Membership Approved',
        employeeName: data.employeeName,
        plan: data.plan,
        startDate: this.formatDate(data.startDate),
        endDate: this.formatDate(data.endDate),
      },
    );
  }

  async sendMembershipRejectedEmail(data: {
    to: string;
    employeeName: string;
    remarks?: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Membership Request Not Approved – MobPae',
      'membership-rejected',
      {
        title: 'Membership Rejected',
        employeeName: data.employeeName,
        remarks: data.remarks ?? 'No reason provided.',
      },
    );
  }

  async sendSelfieVerifiedEmail(data: {
    to: string;
    employeeName: string;
    verifiedDate: Date;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Selfie Verification Approved – MobPae',
      'selfie-verified',
      {
        title: 'Selfie Verified',
        employeeName: data.employeeName,
        verifiedDate: this.formatDate(data.verifiedDate),
      },
    );
  }

  async sendSelfieRejectedEmail(data: {
    to: string;
    employeeName: string;
    remarks?: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Selfie Verification Failed – MobPae',
      'selfie-rejected',
      {
        title: 'Selfie Rejected',
        employeeName: data.employeeName,
        remarks: data.remarks ?? 'Please resubmit a clear selfie.',
      },
    );
  }

  async sendEnquiryStatusUpdatedEmail(data: {
    to: string;
    companyName: string;
    contactPerson: string;
    status: string;
    remarks?: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'Update on Your MobPae Enquiry',
      'enquiry-status-updated',
      {
        title: 'Enquiry Status Update',
        companyName: data.companyName,
        contactPerson: data.contactPerson,
        status: data.status,
        remarks: data.remarks ?? 'No additional notes.',
      },
    );
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private formatCurrency(amount: number): string {
    return `₹${amount.toLocaleString('en-IN')}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
