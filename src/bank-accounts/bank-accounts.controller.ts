import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Bank Accounts')
@ApiBearerAuth()
@Controller('bank-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post()
  @Roles('EMPLOYEE')
  create(
    @Body()
    dto: CreateBankAccountDto,
  ) {
    return this.bankAccountsService.create(dto);
  }

  @Post('employee/:employeeId/upi')
  @Roles('EMPLOYEE')
  updateUpi(
    @Param('employeeId') employeeId: string,
    @Body('upiId') upiId?: string,
  ) {
    return this.bankAccountsService.updateUpi(employeeId, upiId);
  }

  @Get()
  @Roles('ADMIN')
  findAll(@Query('verified') verified?: string) {
    return this.bankAccountsService.findAllForAdmin(
      verified === undefined ? undefined : verified === 'true',
    );
  }
  @Get('employee/:employeeId')
  @Roles('ADMIN', 'EMPLOYEE')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.bankAccountsService.findByEmployee(employeeId);
  }

  @Post(':id/verify')
  @Roles('ADMIN')
  verify(@Param('id') id: string) {
    return this.bankAccountsService.verify(id);
  }
}
