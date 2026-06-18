import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a notification for a user.
   */
  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        title: dto.title,
        message: dto.message,
        type: dto.type,
      },
    });
  }

  /**
   * Returns notifications for a user.
   */
  async findByUser(userId: string) {
    return this.prisma.notification.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Marks notification as read.
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: {
        id,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('You can only update your own notification');
    }

    return this.prisma.notification.update({
      where: {
        id,
      },
      data: {
        isRead: true,
      },
    });
  }

  /**
   * Creates a system notification.
   */

  async createSystemNotification(
    userId: string,
    title: string,
    message: string,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: 'SYSTEM',
      },
    });
  }
}
