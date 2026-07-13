import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformFeeListQueryDto } from './dto/platform-fee-list-query.dto';
import { VerifyPlatformFeePaymentDto } from './dto/verify-platform-fee-payment.dto';
import { WaivePlatformFeeDto } from './dto/waive-platform-fee.dto';
import { PlatformFeesService } from './platform-fees.service';

@ApiTags('Platform Fees')
@ApiBearerAuth()
@Controller('platform-fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlatformFeesController {
  constructor(private readonly platformFeesService: PlatformFeesService) {}

  @Get('config')
  @Roles('EMPLOYEE', 'ADMIN')
  @ApiOperation({ summary: 'Get active salary advance platform fee config' })
  @ApiResponse({
    status: 200,
    description: 'Returns fee amount, currency and Razorpay key ID',
  })
  getConfig() {
    return this.platformFeesService.getConfig();
  }

  @Get('my')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'List my platform fee payments' })
  findMine(@Req() req: any) {
    return this.platformFeesService.findMine(req.user.userId);
  }

  @Post('loan-applications/:loanApplicationId/initiate-payment')
  @Roles('EMPLOYEE')
  @ApiParam({ name: 'loanApplicationId', description: 'Salary advance request ID' })
  @ApiOperation({
    summary: 'Create or reuse a Razorpay order for a request platform fee',
  })
  initiatePayment(
    @Req() req: any,
    @Param('loanApplicationId') loanApplicationId: string,
  ) {
    return this.platformFeesService.initiatePayment(
      req.user.userId,
      loanApplicationId,
    );
  }

  @Post('verify-payment')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Verify Razorpay platform fee payment and move request to admin review',
  })
  verifyPayment(@Req() req: any, @Body() dto: VerifyPlatformFeePaymentDto) {
    return this.platformFeesService.verifyPayment(req.user.userId, dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List platform fees with pagination and filters' })
  findAll(@Query() query: PlatformFeeListQueryDto) {
    return this.platformFeesService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get platform fee details' })
  findOne(@Param('id') id: string) {
    return this.platformFeesService.findOne(id);
  }

  @Post(':id/waive')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Waive a platform fee and move request to admin review',
  })
  waive(@Req() req: any, @Param('id') id: string, @Body() dto: WaivePlatformFeeDto) {
    return this.platformFeesService.waive(id, req.user.userId, dto);
  }
}
