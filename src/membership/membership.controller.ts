import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MembershipService } from './membership.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RejectMembershipDto } from './dto/reject-membership.dto';
import { CreateMembershipCouponDto } from './dto/create-membership-coupon.dto';
import { ValidateMembershipCouponDto } from './dto/validate-membership-coupon.dto';
import { MembershipListQueryDto } from './dto/membership-list-query.dto';
import { CreateMembershipPlanConfigDto } from './dto/create-membership-plan-config.dto';
import { UpdateMembershipPlanConfigDto } from './dto/update-membership-plan-config.dto';

@ApiTags('Membership')
@ApiBearerAuth()
@Controller('membership')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  // ─── Employee: membership status ─────────────────────────────────────────

  @Get('me')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Get my membership status + available plans + payment config' })
  getMyMembership(@Req() req: any) {
    return this.membershipService.getMyMembership(req.user.userId);
  }

  // ─── Employee: Razorpay payment flow ─────────────────────────────────────

  /**
   * Step 1: Create a Razorpay order.
   * Returns { orderId, amount, currency, keyId, planName } needed to open the checkout modal.
   */
  @Post('initiate-payment')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Initiate Razorpay membership payment — creates an order' })
  initiatePayment(@Req() req: any, @Body() dto: InitiatePaymentDto) {
    return this.membershipService.initiatePayment(req.user.userId, dto);
  }

  /**
   * Step 2: Verify payment after checkout modal closes.
   * Validates HMAC signature and activates membership immediately.
   */
  @Post('verify-payment')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Verify Razorpay payment signature and activate membership' })
  verifyPayment(@Req() req: any, @Body() dto: VerifyPaymentDto) {
    return this.membershipService.verifyPayment(req.user.userId, dto);
  }

  // ─── Employee: coupon ────────────────────────────────────────────────────

  @Post('coupons/validate')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Validate a membership coupon code' })
  validateCoupon(@Body() dto: ValidateMembershipCouponDto) {
    return this.membershipService.validateCoupon(dto.couponCode);
  }

  // ─── Employee: config ────────────────────────────────────────────────────

  @Get('config')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Get membership config: plans, benefits, Razorpay key' })
  getConfig() {
    return this.membershipService.getConfig();
  }

  // ─── Admin: Plan config management ───────────────────────────────────────

  @Get('plans')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all membership plan configurations' })
  listPlanConfigs() {
    return this.membershipService.listPlanConfigs();
  }

  @Post('plans')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a new membership plan' })
  createPlanConfig(@Body() dto: CreateMembershipPlanConfigDto) {
    return this.membershipService.createPlanConfig(dto);
  }

  @Patch('plans/:planKey')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update a membership plan' })
  updatePlanConfig(
    @Param('planKey') planKey: string,
    @Body() dto: UpdateMembershipPlanConfigDto,
  ) {
    return this.membershipService.updatePlanConfig(planKey, dto);
  }

  @Patch('plans/:planKey/toggle')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Toggle a membership plan active/inactive' })
  togglePlanConfig(@Param('planKey') planKey: string) {
    return this.membershipService.togglePlanConfig(planKey);
  }

  // ─── Admin: Membership list / detail ─────────────────────────────────────

  @Get('pending')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List pending memberships' })
  findPending(@Query() query: MembershipListQueryDto) {
    return this.membershipService.findPending(query);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List memberships with pagination, search, and filters' })
  findAll(@Query() query: MembershipListQueryDto) {
    return this.membershipService.findAll(query);
  }

  @Get('summary')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get membership summary' })
  getSummary() {
    return this.membershipService.getSummary();
  }

  @Get('employer-summary')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get employer-wise membership summary' })
  getEmployerSummary() {
    return this.membershipService.getEmployerSummary();
  }

  @Get('revenue-summary')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get revenue summary' })
  getRevenueSummary() {
    return this.membershipService.getRevenueSummary();
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get membership details (includes PaymentOrder + events)' })
  findOne(@Param('id') id: string) {
    return this.membershipService.findOne(id);
  }

  // ─── Admin: Manual override (edge cases only) ────────────────────────────

  @Post(':id/approve')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Manually activate a membership (admin override)' })
  approve(@Param('id') id: string, @Req() req: any) {
    return this.membershipService.approve(id, req.user.userId);
  }

  @Post(':id/reject')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cancel/reject a membership (admin override)' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectMembershipDto,
    @Req() req: any,
  ) {
    return this.membershipService.reject(id, dto.remarks, req.user.userId);
  }

  // ─── Admin: Coupon management ─────────────────────────────────────────────

  @Post('coupons')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create membership coupon' })
  createCoupon(@Body() dto: CreateMembershipCouponDto) {
    return this.membershipService.createCoupon(dto);
  }

  @Get('coupons')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all coupons' })
  findAllCoupons() {
    return this.membershipService.findAllCoupons();
  }
}
