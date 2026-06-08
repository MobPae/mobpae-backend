import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  Req,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { EmployersService } from './employers.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { Role } from '../common/enums/role.enum';

import { UpdateEmployerStatusDto } from './dto/update-employer-status.dto';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';

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

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id')
    id: string,

    @Body()
    dto: UpdateEmployerStatusDto,
  ) {
    return this.employersService.updateStatus(id, dto.status);
  }
}
