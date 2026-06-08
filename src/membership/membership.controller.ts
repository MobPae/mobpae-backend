import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ActivateMembershipDto } from './dto/activate-membership.dto';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { MembershipService } from './membership.service';

@ApiTags('Membership')
@ApiBearerAuth()
@Controller('membership')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get('employee/:employeeId')
  @Roles('ADMIN', 'EMPLOYEE')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.membershipService.getEmployeeMembership(employeeId);
  }

  @Post('apply-coupon')
  @Roles('EMPLOYEE')
  applyCoupon(@Body() dto: ApplyCouponDto) {
    return this.membershipService.applyCoupon(dto.employeeId, dto.couponCode);
  }

  @Post('activate')
  @Roles('EMPLOYEE')
  activate(@Body() dto: ActivateMembershipDto) {
    return this.membershipService.activate(dto.employeeId, dto.couponCode);
  }
}
