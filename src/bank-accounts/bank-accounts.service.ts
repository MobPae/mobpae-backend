import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';

type BankAuditAction = 'BANK_SUBMITTED' | 'BANK_APPROVED' | 'BANK_REJECTED';

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private maskAccountNumber(accountNumber: string) {
    return '********' + accountNumber.slice(-4);
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

    return {
      ...account,
      accountNumber: this.maskAccountNumber(account.accountNumber),
    };
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

    return {
      ...account,
      accountNumber: this.maskAccountNumber(account.accountNumber),
    };
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

    return {
      ...account,
      accountNumber: this.maskAccountNumber(account.accountNumber),
    };
  }

  async verify(id: string, actorUserId?: string) {
    const existingAccount = await this.prisma.employeeBankAccount.findUnique({
      where: {
        id,
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

    return {
      ...account,
      accountNumber: this.maskAccountNumber(account.accountNumber),
    };
  }

  async reject(id: string, actorUserId?: string) {
    const existingAccount = await this.prisma.employeeBankAccount.findUnique({
      where: {
        id,
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

    return {
      ...account,
      accountNumber: this.maskAccountNumber(account.accountNumber),
    };
  }

  async findAllForAdmin(verified?: boolean) {
    return this.prisma.employeeBankAccount.findMany({
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

    return accounts.map((account) => ({
      ...account,
      accountNumber: this.maskAccountNumber(account.accountNumber),
    }));
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
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entityType: 'BANK_ACCOUNT',
          entityId: data.entityId,
          oldValue: data.oldValue as any,
          newValue: data.newValue as any,
        },
      });
    } catch (error) {
      console.error('Failed to write bank account audit log', error);
    }
  }
}
