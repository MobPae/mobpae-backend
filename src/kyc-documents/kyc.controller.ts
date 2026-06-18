import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { KycDocumentsService } from './kyc-documents.service';

@ApiTags('KYC')
@ApiBearerAuth()
@Controller('kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KycController {
  constructor(private readonly kycDocumentsService: KycDocumentsService) {}

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
}
