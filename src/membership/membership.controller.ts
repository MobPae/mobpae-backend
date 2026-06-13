import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MembershipService } from './membership.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { RequestMembershipDto } from './dto/request-membership.dto';
import { RejectMembershipDto } from './dto/reject-membership.dto';
import { CreateMembershipCouponDto } from './dto/create-membership-coupon.dto';

@ApiTags('Membership')
@ApiBearerAuth()
@Controller('membership')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  /**
   * Employee
   * Get logged-in employee membership
   */
  @Get('me')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Get my membership',
  })
  getMyMembership(@Req() req: any) {
    return this.membershipService.getMyMembership(req.user.userId);
  }

  /**
   * Employee
   * Submit membership payment request
   */
  @Post('request')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Submit membership request',
  })
  requestMembership(
    @Req() req: any,

    @Body()
    dto: RequestMembershipDto,
  ) {
    return this.membershipService.requestMembership(req.user.userId, dto);
  }

  /**
   * Admin
   * View pending membership requests
   */
  @Get('pending')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get pending memberships',
  })
  findPending() {
    return this.membershipService.findPending();
  }

  /**

 * Admin

 * View all memberships

 */

  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get all memberships',
  })
  findAll() {
    return this.membershipService.findAll();
  }

  /**

 * Admin

 * Membership summary

 */

  @Get('summary')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get membership summary',
  })
  getSummary() {
    return this.membershipService.getSummary();
  }
  /**
   * Admin
   * Create membership coupon
   */
  @Post('coupons')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Create membership coupon',
  })
  createCoupon(
    @Body()
    dto: CreateMembershipCouponDto,
  ) {
    return this.membershipService.createCoupon(dto);
  }

  /**
   * Admin
   * View all coupons
   */
  @Get('coupons')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get membership coupons',
  })
  findAllCoupons() {
    return this.membershipService.findAllCoupons();
  }

  /**
   * Admin
   * Get membership details
   */
  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get membership details',
  })
  findOne(
    @Param('id')
    id: string,
  ) {
    return this.membershipService.findOne(id);
  }

  /**
   * Admin
   * Approve membership
   */
  @Post(':id/approve')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Approve membership',
  })
  approve(
    @Param('id')
    id: string,

    @Req()
    req: any,
  ) {
    return this.membershipService.approve(id, req.user.userId);
  }

  /**
   * Admin
   * Reject membership
   */
  @Post(':id/reject')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Reject membership',
  })
  reject(
    @Param('id')
    id: string,

    @Body()
    dto: RejectMembershipDto,
  ) {
    return this.membershipService.reject(id, dto.remarks);
  }
}
