import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import {
  containsSearch,
  getOrderBy,
  getPagination,
  hasSearch,
  paginate,
} from '../common/utils/pagination.util';
import { NotificationListQueryDto } from './dto/notification-list-query.dto';

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

  async findAll(query: NotificationListQueryDto = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where: any = {
      userId: query.userId,
      isRead: query.isRead === undefined ? undefined : query.isRead === 'true',
      ...(hasSearch(query)
        ? {
            OR: [
              { title: containsSearch(query) },
              { message: containsSearch(query) },
              {
                user: {
                  email: containsSearch(query),
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: getOrderBy(query, ['title', 'type', 'isRead', 'createdAt']),
        skip,
        take,
      }),
      this.prisma.notification.count({
        where,
      }),
    ]);

    return paginate(data, total, page, limit);
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
