import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private maskAccountNumber(accountNumber: string) {
    return '********' + accountNumber.slice(-4);
  }

  async create(dto: CreateBankAccountDto) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id: dto.employeeId,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const existingAccount = await this.prisma.employeeBankAccount.findUnique({
      where: {
        employeeId: dto.employeeId,
      },
    });

    const account = existingAccount
      ? await this.prisma.employeeBankAccount.update({
          where: {
            employeeId: dto.employeeId,
          },
          data: {
            ...dto,
            verified: this.didBankDetailsChange(existingAccount, dto)
              ? false
              : existingAccount.verified,
          },
        })
      : await this.prisma.employeeBankAccount.create({
          data: dto,
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

  async verify(id: string) {
    return this.prisma.employeeBankAccount.update({
      where: {
        id,
      },
      data: {
        verified: true,
      },
    });
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
}
