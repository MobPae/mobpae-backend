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

    const account = await this.prisma.employeeBankAccount.create({
      data: dto,
    });

    return {
      ...account,
      accountNumber: this.maskAccountNumber(account.accountNumber),
    };
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
}
