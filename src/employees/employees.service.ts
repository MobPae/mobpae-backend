import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmployeeDto, userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new Error('Employer not found');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    const defaultPassword = 'MobPae@123';

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        role: 'EMPLOYEE',
        isActive: true,
      },
    });

    const employee = await this.prisma.employee.create({
      data: {
        userId: user.id,
        employerId: employer.id,
        employeeCode: dto.employeeCode,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        salaryInHand: dto.salaryInHand,
      },
    });

    return {
      employee,
      credentials: {
        email: dto.email,
        password: defaultPassword,
      },
    };
  }

  async findAll() {
    return this.prisma.employee.findMany({
      include: {
        employer: true,
      },
    });
  }

  async update(employeeId: string, dto: UpdateEmployeeDto, userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new Error('Employer not found');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        employerId: employer.id,
      },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    return this.prisma.employee.update({
      where: {
        id: employeeId,
      },
      data: {
        ...dto,
      },
    });
  }

  async getKycStatus(employeeId: string) {
    const documents = await this.prisma.kycDocument.findMany({
      where: {
        employeeId,
        status: 'VERIFIED',
      },
    });

    const pan = documents.some((doc) => doc.documentType === 'PAN');

    const aadhar = documents.some((doc) => doc.documentType === 'AADHAR');

    const salarySlip = documents.some(
      (doc) => doc.documentType === 'SALARY_SLIP',
    );

    return {
      pan,
      aadhar,
      salarySlip,
      kycCompleted: pan && aadhar && salarySlip,
    };
  }
}
