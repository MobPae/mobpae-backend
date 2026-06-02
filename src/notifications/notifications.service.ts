import { Injectable } from '@nestjs/common';
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
  async markAsRead(id: string) {
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
