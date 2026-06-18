import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Get('me')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  findMine(@Req() req: any) {
    return this.notificationsService.findByUser(req.user.userId);
  }

  @Get('user/:userId')
  @Roles('ADMIN')
  findByUser(@Param('userId') userId: string) {
    return this.notificationsService.findByUser(userId);
  }

  @Post(':id/read')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.notificationsService.markAsRead(id, req.user.userId);
  }
}
