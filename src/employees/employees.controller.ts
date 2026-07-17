import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmployerPermissionGuard } from '../auth/guards/employer-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeActivationDto } from './dto/update-employee-activation.dto';
import { BulkEmployeeActivationDto } from './dto/bulk-employee-activation.dto';
import { EmployeeListQueryDto } from './dto/employee-list-query.dto';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles('EMPLOYER')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.EMPLOYEE_MANAGE)
  create(@Body() dto: CreateEmployeeDto, @Req() req: any) {
    return this.employeesService.create(dto, req.user.employerId, req.user.userId);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'List employees with pagination, search, sorting, and filters',
  })
  findAll(@Query() query: EmployeeListQueryDto) {
    return this.employeesService.findAll(query);
  }

  @Get('employer')
  @Roles('EMPLOYER')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.EMPLOYEE_VIEW)
  findAllForEmployer(@Req() req: any) {
    return this.employeesService.findAllForEmployer(req.user.employerId);
  }

  @Get('me')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Get current employee profile',
  })
  findMe(@Req() req: any) {
    return this.employeesService.findByUserId(req.user.userId);
  }

  @Get('me/app-state')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Get employee mobile app state, setup status, and next action',
  })
  getMyAppState(@Req() req: any) {
    return this.employeesService.getAppState(req.user.userId);
  }

  @Get('me/profile')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Get current employee profile with photo',
  })
  getMyProfile(@Req() req: any) {
    return this.employeesService.getProfile(req.user.userId);
  }

  @Get('me/peer-activity')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary:
      'Anonymised peer activity from the same employer — social proof for the employee dashboard',
  })
  getPeerActivity(@Req() req: any) {
    return this.employeesService.getPeerActivity(req.user.userId);
  }

  @Post('profile-photo')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Upload or replace employee profile photo',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadProfilePhoto(@Req() req: any, @UploadedFile() file: any) {
    return this.employeesService.uploadProfilePhoto(req.user.userId, file);
  }

  @Get(':id/kyc-status')
  @Roles('ADMIN', 'EMPLOYEE')
  getKycStatus(@Param('id') id: string, @Req() req: any) {
    if (req.user.role === 'EMPLOYEE' && req.user.employeeId !== id) {
      throw new ForbiddenException('You can only access your own KYC status');
    }

    return this.employeesService.getKycStatus(id);
  }

  @Post('bulk')
  @Roles('EMPLOYER')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.EMPLOYEE_MANAGE)
  @ApiOperation({
    summary: 'Bulk upload employees',
  })
  bulkCreate(
    @Req() req: any,

    @Body()
    employees: CreateEmployeeDto[],
  ) {
    return this.employeesService.bulkCreate(req.user.employerId, employees, req.user.userId);
  }

  @Patch('bulk-activation')
  @Roles('EMPLOYER')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.EMPLOYEE_MANAGE)
  bulkActivation(@Body() dto: BulkEmployeeActivationDto, @Req() req: any) {
    return this.employeesService.bulkActivation(
      dto.employeeIds,
      dto.appActivated,
      req.user.employerId,
      req.user.userId,
    );
  }

  @Patch(':id/activation')
  @Roles('EMPLOYER')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.EMPLOYEE_MANAGE)
  updateActivation(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeActivationDto,
    @Req() req: any,
  ) {
    return this.employeesService.updateActivation(
      id,
      dto.appActivated,
      req.user.employerId,
      req.user.userId,
    );
  }

  @Patch(':id')
  @Roles('EMPLOYER')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.EMPLOYEE_MANAGE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: any,
  ) {
    return this.employeesService.update(id, dto, req.user.employerId, req.user.userId);
  }

  /**
   * Resend activation email — generates a new temp password and resends the
   * employee-created email. Blocked if the employee has already set their own password.
   * Accessible by both ADMIN and EMPLOYER (employer-scoped ownership check in service).
   */
  @Post(':id/resend-activation')
  @Roles('ADMIN', 'EMPLOYER')
  @ApiOperation({ summary: 'Resend activation email for an employee who has not yet set their password' })
  resendActivationEmail(@Param('id') id: string, @Req() req: any) {
    const employerId = req.user.role === 'EMPLOYER' ? req.user.employerId : undefined;
    return this.employeesService.resendActivationEmail(id, employerId);
  }
}
