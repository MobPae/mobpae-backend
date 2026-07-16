import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { MulticastMessage } from 'firebase-admin/messaging';

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);
  private initialized = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase credentials not configured — push notifications disabled. ' +
          'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.',
      );
      return;
    }

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    }

    this.initialized = true;
    this.logger.log('Firebase Admin SDK initialised');
  }

  /**
   * Register or refresh a device token for a user.
   * Upserts on token value — same token from a re-login just updates the timestamp.
   */
  async registerToken(userId: string, token: string, platform: string) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, updatedAt: new Date() },
    });
  }

  /**
   * Remove a device token (on logout).
   */
  async removeToken(token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
  }

  /**
   * Send a push notification to all devices registered to a user.
   * Silently removes stale tokens (FCM returns 404/410 for expired tokens).
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.initialized) return;

    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (tokens.length === 0) return;

    const tokenStrings = tokens.map((t) => t.token);

    const message: MulticastMessage = {
      tokens: tokenStrings,
      notification: { title, body },
      data: data ?? {},
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'mobpae_default' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    };

    try {
      const response = await getMessaging().sendEachForMulticast(message);

      // Clean up stale tokens
      const staleTokens: string[] = [];
      response.responses.forEach((res, idx) => {
        if (!res.success) {
          const code = res.error?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            staleTokens.push(tokenStrings[idx]);
          } else {
            this.logger.warn(`FCM error for token[${idx}]: ${code}`);
          }
        }
      });

      if (staleTokens.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { token: { in: staleTokens } },
        });
        this.logger.log(`Removed ${staleTokens.length} stale FCM token(s)`);
      }

      this.logger.log(
        `Push sent to ${response.successCount}/${tokenStrings.length} devices for user ${userId}`,
      );
    } catch (err) {
      this.logger.error('FCM multicast error', err);
    }
  }
}
