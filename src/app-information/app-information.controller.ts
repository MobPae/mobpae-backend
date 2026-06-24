import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AppInformationService } from './app-information.service';
import {
  AppInfoType,
  CreateAppInformationDto,
} from './dto/create-app-information.dto';
import { UpdateAppInformationDto } from './dto/update-app-information.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('App Information')
@Controller('app-information')
export class AppInformationController {
  constructor(private readonly service: AppInformationService) {}

  /**
   * Public — returns all active app information sections.
   * Used by the employee app's Profile > About, Privacy Policy, Terms & Conditions screens.
   */
  @Get()
  @ApiOperation({ summary: 'Get all active app information (public)' })
  findAllActive() {
    return this.service.findAllActive();
  }

  /**
   * Admin — list all (including inactive). Must be before :type to avoid route conflict.
   */
  @Get('admin/all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: list all app information entries' })
  findAll() {
    return this.service.findAll();
  }

  /**
   * Public — returns a specific section by type.
   */
  @Get(':type')
  @ApiOperation({ summary: 'Get app information by type (public)' })
  @ApiParam({ name: 'type', enum: AppInfoType, example: 'ABOUT' })
  findByType(@Param('type') type: AppInfoType) {
    return this.service.findByType(type);
  }

  /**
   * Admin — create or update by type (upsert).
   */
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Admin: create or update app information (upsert by type)',
  })
  upsert(@Body() dto: CreateAppInformationDto) {
    return this.service.upsert(dto);
  }

  /**
   * Admin — update a specific entry by id.
   */
  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: update app information by id' })
  update(@Param('id') id: string, @Body() dto: UpdateAppInformationDto) {
    return this.service.update(id, dto);
  }
}
