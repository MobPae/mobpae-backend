/**
 * WebhooksController
 *
 * Handles incoming Razorpay webhook events. This endpoint:
 * - Is NOT protected by JwtAuthGuard (Razorpay doesn't have a JWT)
 * - Verifies the X-Razorpay-Signature header before processing
 * - Routes the event by stored PaymentOrder purpose before business handling
 *
 * Requires rawBody: true in NestFactory.create options (set in main.ts).
 */
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { RazorpayService } from '../razorpay/razorpay.service';
import { MembershipService } from '../membership/membership.service';
import { PlatformFeesService } from '../platform-fees/platform-fees.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly razorpayService: RazorpayService,
    private readonly membershipService: MembershipService,
    private readonly platformFeesService: PlatformFeesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('razorpay')
  @HttpCode(200)
  async handleRazorpayWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
  ) {
    // 1. Verify signature before reading payload
    if (!signature) {
      this.logger.warn('Razorpay webhook received without signature header');
      throw new UnauthorizedException('Missing signature');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error(
        'rawBody is undefined — ensure rawBody: true in NestFactory.create',
      );
      throw new UnauthorizedException('Cannot verify signature');
    }

    const valid = this.razorpayService.verifyWebhookSignature(
      rawBody,
      signature,
    );
    if (!valid) {
      this.logger.warn('Invalid Razorpay webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    // 2. Parse and route event
    let event: {
      event: string;
      payload: {
        payment?: {
          entity: {
            id: string;
            order_id: string;
            status: string;
            method: string;
            error_code?: string;
            error_description?: string;
          };
        };
      };
    };

    try {
      event = JSON.parse(rawBody.toString());
    } catch (err) {
      this.logger.warn('Malformed Razorpay webhook payload');
      throw new BadRequestException('Malformed webhook payload');
    }

    this.logger.log(`Razorpay webhook: ${event.event}`);

    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        const payment = event.payload.payment?.entity;
        if (!payment) break;

        try {
          const purpose = await this.resolvePaymentOrderPurpose(payment.order_id);
          if (purpose === 'PLATFORM_FEE') {
            await this.platformFeesService.handleWebhookPayment({
              eventType: event.event,
              razorpayOrderId: payment.order_id,
              razorpayPaymentId: payment.id,
              status: payment.status,
              method: payment.method,
              rawPayload: event,
            });
          } else if (purpose === 'MEMBERSHIP') {
            await this.membershipService.handleWebhookPayment({
              eventType: event.event,
              razorpayOrderId: payment.order_id,
              razorpayPaymentId: payment.id,
              status: payment.status,
              method: payment.method,
              rawPayload: event,
            });
          }
        } catch (err) {
          this.logger.error('Error processing webhook payment event', err);
          throw new InternalServerErrorException('Webhook processing failed');
        }
        break;
      }

      case 'payment.failed': {
        const payment = event.payload.payment?.entity;
        if (!payment) break;

        try {
          const purpose = await this.resolvePaymentOrderPurpose(payment.order_id);
          if (purpose === 'PLATFORM_FEE') {
            await this.platformFeesService.handleWebhookPaymentFailed({
              razorpayOrderId: payment.order_id,
              razorpayPaymentId: payment.id,
              errorCode: payment.error_code,
              errorDescription: payment.error_description,
              rawPayload: event,
            });
          } else if (purpose === 'MEMBERSHIP') {
            await this.membershipService.handleWebhookPaymentFailed({
              razorpayOrderId: payment.order_id,
              razorpayPaymentId: payment.id,
              errorCode: payment.error_code,
              errorDescription: payment.error_description,
              rawPayload: event,
            });
          }
        } catch (err) {
          this.logger.error(
            'Error processing webhook payment.failed event',
            err,
          );
          throw new InternalServerErrorException('Webhook processing failed');
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled Razorpay event: ${event.event}`);
    }

    // Return 200 only after successful processing or for intentionally ignored events.
    // Transient processing failures throw above so Razorpay can retry safely.
    return { received: true };
  }

  private async resolvePaymentOrderPurpose(providerOrderId: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { providerOrderId },
      select: { purpose: true },
    });

    if (!order) {
      this.logger.warn(
        `Ignoring Razorpay webhook for unknown order ${providerOrderId}`,
      );
      return null;
    }

    return order.purpose;
  }
}
