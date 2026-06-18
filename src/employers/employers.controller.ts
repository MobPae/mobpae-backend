import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  Req,
  Param,
  UseGuards,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { EmployersService } from './employers.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { Role } from '../common/enums/role.enum';

import { UpdateEmployerStatusDto } from './dto/update-employer-status.dto';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';
import { CreateEmployerDto } from './dto/create-employer.dto';

@ApiTags('Employers')
@ApiBearerAuth()
@Controller('employers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployersController {
  constructor(private readonly employersService: EmployersService) {}

  /**
   * Employer Profile
   */

  @Get('profile')
  @Roles(Role.EMPLOYER)
  getProfile(@Req() req: any) {
    return this.employersService.getProfile(req.user.userId);
  }

  @Put('profile')
  @Roles(Role.EMPLOYER)
  updateProfile(@Req() req: any, @Body() dto: UpdateEmployerProfileDto) {
    return this.employersService.updateProfile(req.user.userId, dto);
  }

  /**
   * Admin APIs
   */

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.employersService.findAll();
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
