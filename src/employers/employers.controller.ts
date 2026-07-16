import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  Req,
  Param,
  Query,
  UseGuards,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { EmployersService } from './employers.service';
import { EmployerMembersService } from '../employer-members/employer-members.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmployerPermissionGuard } from '../auth/guards/employer-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions';

import { Role } from '../common/enums/role.enum';

import { UpdateEmployerStatusDto } from './dto/update-employer-status.dto';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';
import { CreateEmployerDto } from './dto/create-employer.dto';
import { EmployerListQueryDto } from './dto/employer-list-query.dto';

@ApiTags('Employers')
@ApiBearerAuth()
@Controller('employers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployersController {
  constructor(
    private readonly employersService: EmployersService,
    private readonly employerMembersService: EmployerMembersService,
  ) {}

  /**
   * Employer Profile
   */

  @Get('profile')
  @Roles(Role.EMPLOYER)
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.ORG_SETTINGS_VIEW)
  getProfile(@Req() req: any) {
    return this.employersService.getProfile(req.user.employerId);
  }

  @Put('profile')
  @Roles(Role.EMPLOYER)
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.ORG_SETTINGS_MANAGE)
  updateProfile(@Req() req: any, @Body() dto: UpdateEmployerProfileDto) {
    return this.employersService.updateProfile(req.user.employerId, dto);
  }

  /**
   * Admin APIs
   */

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List employers with pagination, search, sorting, and filters',
  })
  findAll(@Query() query: EmployerListQueryDto) {
    return this.employersService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(
    @Param('id')
    id: string,
  ) {
    return this.employersService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Create employer',
  })
  create(
    @Req()
    req: any,

    @Body()
    dto: CreateEmployerDto,
  ) {
    return this.employersService.create(dto, req.user.userId);
  }

  /** Admin: list active/suspended members for any employer */
  @Get(':id/members')
  @Roles(Role.ADMIN)
  getEmployerMembers(@Param('id') id: string) {
    return this.employerMembersService.listMembers(id);
  }

  /** Admin: list pending invites for any employer */
  @Get(':id/invites')
  @Roles(Role.ADMIN)
  getEmployerInvites(@Param('id') id: string) {
    return this.employerMembersService.listInvites(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id')
    id: string,

    @Body()
    dto: UpdateEmployerStatusDto,

    @Req()
    req: any,
  ) {
    return this.employersService.updateStatus(id, dto.status, req.user.userId);
  }
}
