import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MembershipService } from './membership.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Membership')
@ApiBearerAuth()
@Controller('membership')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  /**
   * Employee
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
   * Admin
   */
  @Post('activate/:employeeId')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Activate membership',
  })
  activate(
    @Param('employeeId')
    employeeId: string,
  ) {
    return this.membershipService.activate(employeeId);
  }
}
