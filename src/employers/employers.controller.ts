import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmployersService } from './employers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Patch, Body } from '@nestjs/common';
import { UpdateEmployerStatusDto } from './dto/update-employer-status.dto';

@ApiTags('Employers')
@ApiBearerAuth()
@Controller('employers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class EmployersController {
  constructor(private readonly employersService: EmployersService) {}

  @Get()
  findAll() {
    return this.employersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,

    @Body() dto: UpdateEmployerStatusDto,
  ) {
    return this.employersService.updateStatus(id, dto.status);
  }
}
