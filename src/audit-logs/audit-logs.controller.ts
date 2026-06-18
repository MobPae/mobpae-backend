import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List audit logs' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'action', required: false, example: 'EMPLOYER_CREATED' })
  @ApiQuery({ name: 'entityType', required: false, example: 'EMPLOYER' })
  @ApiQuery({ name: 'userId', required: false, example: 'user-id' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [
          {
            id: 'audit-log-id',
            userId: 'user-id',
            action: 'EMPLOYER_CREATED',
            entityType: 'EMPLOYER',
            entityId: 'employer-id',
            oldValue: null,
            newValue: {},
            createdAt: '2026-06-18T00:00:00.000Z',
            user: {
              id: 'user-id',
              email: 'admin@mobpae.com',
              role: 'ADMIN',
            },
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      },
    },
  })
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogsService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get audit log details' })
  @ApiResponse({
    status: 200,
    description: 'Audit log details',
  })
  findOne(@Param('id') id: string) {
    return this.auditLogsService.findOne(id);
  }
}
