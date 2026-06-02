import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { KycDocumentsService } from './kyc-documents.service';

import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';

@Controller('kyc-documents')
export class KycDocumentsController {
  constructor(private readonly kycDocumentsService: KycDocumentsService) {}

  @Post()
  create(
    @Body()
    dto: CreateKycDocumentDto,
  ) {
    return this.kycDocumentsService.create(dto);
  }

  @Get('employee/:employeeId')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.kycDocumentsService.findByEmployee(employeeId);
  }

  @Get('pending')
  findPending() {
    return this.kycDocumentsService.findPending();
  }

  @Post(':id/verify')
  verify(@Param('id') id: string) {
    return this.kycDocumentsService.verify(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.kycDocumentsService.reject(id);
  }
}
