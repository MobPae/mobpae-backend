import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Bank Accounts')
@ApiBearerAuth()
@Controller('bank-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post()
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Submit or resubmit employee bank account details' })
  create(
    @Req() req: any,

    @Body()
    dto: CreateBankAccountDto,
  ) {
    return this.bankAccountsService.create(req.user.userId, dto);
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

  @Get('pending-by-employer')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Group pending bank verifications by employer' })
  findPendingByEmployer() {
    return this.bankAccountsService.findPendingByEmployer();
  }

  @Get('pending-by-employer/:employerId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List pending bank verifications for one employer' })
  findPendingForEmployer(@Param('employerId') employerId: string) {
    return this.bankAccountsService.findPendingForEmployer(employerId);
  }

  @Get('my')
  @Roles('EMPLOYEE')
  findMyBankAccount(@Req() req: any) {
    return this.bankAccountsService.findByUserId(req.user.userId);
  }
  @Get('employee/:employeeId')
  @Roles('ADMIN', 'EMPLOYEE')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.bankAccountsService.findByEmployee(employeeId);
  }

  @Post(':id/verify')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Approve bank account verification' })
  verify(@Param('id') id: string, @Req() req: any) {
    return this.bankAccountsService.verify(id, req.user.userId);
  }

  @Post(':id/reject')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reject bank account verification' })
  reject(@Param('id') id: string, @Req() req: any) {
    return this.bankAccountsService.reject(id, req.user.userId);
  }
}
