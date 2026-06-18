import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: 'ok',
        database: 'connected',
        timestamp: '2026-06-18T00:00:00.000Z',
      },
    },
  })
  async check() {
    if (process.env.NODE_ENV === 'production') {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    }

    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
