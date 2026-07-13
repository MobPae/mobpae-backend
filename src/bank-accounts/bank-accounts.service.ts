import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

type BankAuditAction = 'BANK_SUBMITTED' | 'BANK_APPROVED' | 'BANK_REJECTED';

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  private maskAccountNumber(accountNumber: string): string;
  private maskAccountNumber(accountNumber?: string | null): string | null;
  private maskAccountNumber(accountNumber?: string | null) {
    if (!accountNumber) return null;
    return '********' + accountNumber.slice(-4);
  }

  private toSafeAccountResponse<T extends Record<string, any>>(
    account: T | null,
  ) {
    if (!account) return null;

    return {
      ...account,
      accountNumber: this.maskAccountNumber(account.accountNumber),
    };
  }

  private toSafeAuditValue(value?: Record<string, unknown> | null) {
    const safeValue = this.toSafeAccountResponse(
      value as Record<string, any> | null,
    );

    if (!safeValue) return null;

    return {
      ...safeValue,
      // UPI can be personally identifying; audit snapshots only need to show it changed.
      upiId: safeValue.upiId ? '[REDACTED]' : safeValue.upiId,
    };
  }

  async create(userId: string, dto: CreateBankAccountDto) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const existingAccount = await this.prisma.employeeBankAccount.findUnique({
      where: {
        employeeId: employee.id,
      },
    });

    const account = existingAccount
      ? await this.prisma.employeeBankAccount.update({
          where: {
            employeeId: employee.id,
          },
          data: {
            accountHolderName: dto.accountHolderName,
            accountNumber: dto.accountNumber,
            ifscCode: dto.ifscCode,
            bankName: dto.bankName,
            upiId: dto.upiId,

            verified: this.didBankDetailsChange(existingAccount, dto)
              ? false
              : existingAccount.verified,
          },
        })
      : await this.prisma.employeeBankAccount.create({
          data: {
            employeeId: employee.id,

            accountHolderName: dto.accountHolderName,
            accountNumber: dto.accountNumber,
            ifscCode: dto.ifscCode,
            bankName: dto.bankName,
            upiId: dto.upiId,
          },
        });

    await this.writeAuditLog({
      userId,
      action: 'BANK_SUBMITTED',
      entityId: account.id,
      oldValue: existingAccount,
      newValue: account,
    });

    return this.toSafeAccountResponse(account);
  }

  private didBankDetailsChange(
    existingAccount: {
      accountHolderName: string;
      accountNumber: string;
      ifscCode: string;
      bankName: string | null;
    },
    dto: CreateBankAccountDto,
  ) {
    return (
      existingAccount.accountHolderName !== dto.accountHolderName ||
      existingAccount.accountNumber !== dto.accountNumber ||
      existingAccount.ifscCode !== dto.ifscCode ||
      (existingAccount.bankName ?? '') !== (dto.bankName ?? '')
    );
  }

  async findByEmployee(employeeId: string) {
    const account = await this.prisma.employeeBankAccount.findUnique({
      where: {
        employeeId,
      },
    });

    if (!account) {
      return null;
    }

    return this.toSafeAccountResponse(account);
  }

  async updateUpi(employeeId: string, upiId?: string) {
    const account = await this.prisma.employeeBankAccount.update({
      where: {
        employeeId,
      },
      data: {
        upiId: upiId?.trim() || null,
      },
    });

    return this.toSafeAccountResponse(account);
  }

  async verify(id: string, actorUserId?: string) {
    const existingAccount = await this.prisma.employeeBankAccount.findUnique({
      where: {
        id,
      },
      include: {
        employee: true,
      },
    });

    if (!existingAccount) {
      throw new NotFoundException('Bank account not found');
    }

    const account = await this.prisma.employeeBankAccount.update({
      where: {
        id,
      },
      data: {
        verified: true,
      },
    });

    await this.writeAuditLog({
      userId: actorUserId,
      action: 'BANK_APPROVED',
      entityId: account.id,
      oldValue: existingAccount,
      newValue: account,
    });

    if (existingAccount.employee.userId) {
      await this.notificationsService.createSystemNotification(
        existingAccount.employee.userId,
        'Bank Account Approved',
        'Your bank account has been verified successfully.',
      );
    }

    try {
      await this.emailService.sendBankAccountVerifiedEmail({
        to: existingAccount.employee.email,
        employeeName: existingAccount.employee.name,
        accountHolder: existingAccount.accountHolderName,
        bankName: existingAccount.bankName ?? undefined,
        maskedAccount: this.maskAccountNumber(existingAccount.accountNumber),
      });
    } catch (err) {
      console.error('Failed to send bank account verified email', err);
    }

    return this.toSafeAccountResponse(account);
  }

  async reject(id: string, actorUserId?: string) {
    const existingAccount = await this.prisma.employeeBankAccount.findUnique({
      where: {
        id,
      },
      include: {
        employee: true,
      },
    });

    if (!existingAccount) {
      throw new NotFoundException('Bank account not found');
    }

    const account = await this.prisma.employeeBankAccount.update({
      where: {
        id,
      },
      data: {
        verified: false,
      },
    });

    await this.writeAuditLog({
      userId: actorUserId,
      action: 'BANK_REJECTED',
      entityId: account.id,
      oldValue: existingAccount,
      newValue: account,
    });

    if (existingAccount.employee.userId) {
      await this.notificationsService.createSystemNotification(
        existingAccount.employee.userId,
        'Bank Account Rejected',
        'Your bank account verification was rejected. Please update your details and submit again.',
      );
    }

    try {
      await this.emailService.sendBankAccountRejectedEmail({
        to: existingAccount.employee.email,
        employeeName: existingAccount.employee.name,
        maskedAccount: this.maskAccountNumber(existingAccount.accountNumber),
      });
    } catch (err) {
      console.error('Failed to send bank account rejected email', err);
    }

    return this.toSafeAccountResponse(account);
  }

  async findAllForAdmin(verified?: boolean) {
    const accounts = await this.prisma.employeeBankAccount.findMany({
      where: verified === undefined ? undefined : { verified },
      include: {
        employee: {
          include: {
            employer: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return accounts.map((account) => this.toSafeAccountResponse(account));
  }

  async findPendingByEmployer() {
    const accounts = await this.prisma.employeeBankAccount.findMany({
      where: {
        verified: false,
      },
      select: {
        id: true,
        employee: {
          select: {
            employer: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
      },
    });

    const grouped = new Map<
      string,
      { employerId: string; companyName: string; pendingCount: number }
    >();

    for (const account of accounts) {
      const employer = account.employee.employer;
      const existing = grouped.get(employer.id);

      grouped.set(employer.id, {
        employerId: employer.id,
        companyName: employer.companyName,
        pendingCount: (existing?.pendingCount ?? 0) + 1,
      });
    }

    return [...grouped.values()].sort((a, b) =>
      a.companyName.localeCompare(b.companyName),
    );
  }

  async findPendingForEmployer(employerId: string) {
    const accounts = await this.prisma.employeeBankAccount.findMany({
      where: {
        verified: false,
        employee: {
          employerId,
        },
      },
      include: {
        employee: {
          include: {
            employer: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return accounts.map((account) => this.toSafeAccountResponse(account));
  }

  async findByUserId(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    return this.findByEmployee(employee.id);
  }

  private async writeAuditLog(data: {
    userId?: string;
    action: BankAuditAction;
    entityId: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }) {
    await this.auditLogsService.log({
      userId: data.userId,
      action: data.action,
      entityType: 'BANK_ACCOUNT',
      entityId: data.entityId,
      oldValue: this.toSafeAuditValue(data.oldValue),
      newValue: this.toSafeAuditValue(data.newValue),
    });
  }
}
