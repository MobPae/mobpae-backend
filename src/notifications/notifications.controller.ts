import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushNotificationService } from './push-notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationListQueryDto } from './dto/notification-list-query.dto';
import { IsIn, IsString } from 'class-validator';

class RegisterTokenDto {
  @IsString()
  token: string;

  @IsIn(['ios', 'android', 'web'])
  platform: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  // ── Push token registration ──────────────────────────────────────────────

  @Post('register-token')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  @ApiOperation({ summary: 'Register or refresh a push notification device token' })
  registerToken(@Body() dto: RegisterTokenDto, @Req() req: any) {
    return this.pushNotificationService.registerToken(
      req.user.userId,
      dto.token,
      dto.platform,
    );
  }

  @Delete('remove-token')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  @ApiOperation({ summary: 'Remove a push notification device token on logout' })
  removeToken(@Body() dto: Pick<RegisterTokenDto, 'token'>) {
    return this.pushNotificationService.removeToken(dto.token);
  }

  // ── In-app notifications ─────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'List notifications with pagination, search, sorting, and filters',
  })
  findAll(@Query() query: NotificationListQueryDto) {
    return this.notificationsService.findAll(query);
  }

  @Get('me')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  findMine(@Req() req: any) {
    return this.notificationsService.findByUser(req.user.userId);
  }

  @Get('me/count')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  @ApiOperation({ summary: 'Get my unread notification count' })
  @ApiResponse({
    status: 200,
    schema: {
      example: { unread: 4 },
    },
  })
  getMyUnreadCount(@Req() req: any) {
    return this.notificationsService.countUnread(req.user.userId);
  }

  @Get('user/:userId')
  @Roles('ADMIN')
  findByUser(@Param('userId') userId: string) {
    return this.notificationsService.findByUser(userId);
  }

  @Post('me/read-all')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  @ApiResponse({ status: 200, schema: { example: { updated: 4 } } })
  markAllAsRead(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }

  @Post(':id/read')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.notificationsService.markAsRead(id, req.user.userId);
  }
}
