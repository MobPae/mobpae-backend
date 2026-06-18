import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionCleanupService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.cleanupInactiveSessions();

    setInterval(
      () => {
        void this.cleanupInactiveSessions();
      },
      24 * 60 * 60 * 1000,
    );
  }

  private async cleanupInactiveSessions() {
    const olderThan = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    try {
      const result = await this.prisma.userSession.deleteMany({
        where: {
          isActive: false,
          updatedAt: {
            lt: olderThan,
          },
        },
      });

      if (result.count > 0) {
        console.log(`Deleted ${result.count} inactive user sessions`);
      }
    } catch (error) {
      console.error('Failed to clean inactive user sessions', error);
    }
  }
}
