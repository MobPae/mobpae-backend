import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { KycDocumentsService } from './kyc-documents.service';
import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('KYC Documents')
@ApiBearerAuth()
@Controller('kyc-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KycDocumentsController {
  constructor(private readonly kycDocumentsService: KycDocumentsService) {}

  @Post()
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Submit or resubmit a KYC document' })
  create(
    @Req() req: any,

    @Body() dto: CreateKycDocumentDto,
  ) {
    return this.kycDocumentsService.create(req.user.userId, dto);
  }

  @Get('my')
  @Roles('EMPLOYEE')
  findMyKyc(@Req() req: any) {
    return this.kycDocumentsService.findByUserId(req.user.userId);
  }

  @Get('employee/:employeeId')
  @Roles('ADMIN')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.kycDocumentsService.findByEmployee(employeeId);
  }

  @Get('pending')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all pending KYC documents' })
  findPending() {
    return this.kycDocumentsService.findPending();
  }

  @Get('pending-by-employer')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Group pending KYC documents by employer' })
  findPendingByEmployer() {
    return this.kycDocumentsService.findPendingByEmployer();
  }

  @Get('pending-by-employer/:employerId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List pending KYC documents for one employer' })
  findPendingForEmployer(@Param('employerId') employerId: string) {
    return this.kycDocumentsService.findPendingForEmployer(employerId);
  }

  @Get('grouped-by-employee')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List KYC status grouped by employee' })
  findGroupedByEmployee(
    @Query('employerId') employerId?: string,
    @Query('status') status?: 'PENDING' | 'VERIFIED' | 'REJECTED',
  ) {
    return this.kycDocumentsService.findGroupedByEmployee({
      employerId,
      status,
    });
  }

  @Get()
  @Roles('ADMIN')
  findAll(
    @Query('status') status?: 'PENDING' | 'VERIFIED' | 'REJECTED',
    @Query('employeeId') employeeId?: string,
  ) {
    return this.kycDocumentsService.findAll({ status, employeeId });
  }

  @Post(':id/verify')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Approve a KYC document' })
  verify(@Param('id') id: string, @Req() req: any) {
    return this.kycDocumentsService.verify(id, req.user.userId);
  }

  @Post(':id/reject')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reject a KYC document' })
  reject(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { note?: string } = {},
  ) {
    return this.kycDocumentsService.reject(id, req.user.userId, body.note);
  }

}
