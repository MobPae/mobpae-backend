import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { KycDocumentsService } from './kyc-documents.service';
import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('KYC Documents')
@ApiBearerAuth()
@Controller('kyc-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KycDocumentsController {
  constructor(private readonly kycDocumentsService: KycDocumentsService) {}

  @Post()
  @Roles('EMPLOYEE')
  create(
    @Body()
    dto: CreateKycDocumentDto,
  ) {
    return this.kycDocumentsService.create(dto);
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
  findPending() {
    return this.kycDocumentsService.findPending();
  }

  @Get()
  @Roles('ADMIN')
  findAll(@Query('status') status?: 'PENDING' | 'VERIFIED' | 'REJECTED') {
    return this.kycDocumentsService.findAll(status);
  }

  @Post(':id/verify')
  @Roles('ADMIN')
  verify(@Param('id') id: string) {
    return this.kycDocumentsService.verify(id);
  }

  @Post(':id/reject')
  @Roles('ADMIN')
  reject(@Param('id') id: string) {
    return this.kycDocumentsService.reject(id);
  }
}
