import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private readonly templateCache = new Map<string, string>();

  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: Number(process.env.SMTP_PORT) === 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: true,
    },
  });

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
    const info = await this.transporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM}>`,
      to,
      subject,
      html,
    });

    return {
      messageId: info.messageId,
      accepted: info.accepted,
    };
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
    payrollMonth: string;
    outstandingAmount: number;
    settlementId: string;
  }) {
    return this.sendTemplateEmail(
      data.to,
      'MobPae Settlement Report',
      'settlement-report',
      {
        title: 'Settlement Report',
        companyName: data.companyName,
        payrollMonth: data.payrollMonth,
        outstandingAmount: this.formatCurrency(data.outstandingAmount),
        settlementId: data.settlementId,
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
}
