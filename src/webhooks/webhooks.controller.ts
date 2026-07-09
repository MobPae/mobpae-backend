/**
 * WebhooksController
 *
 * Handles incoming Razorpay webhook events. This endpoint:
 * - Is NOT protected by JwtAuthGuard (Razorpay doesn't have a JWT)
 * - Verifies the X-Razorpay-Signature header before processing
 * - Delegates to MembershipService.handleWebhookPayment() for business logic
 *
 * Requires rawBody: true in NestFactory.create options (set in main.ts).
 */
import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { RazorpayService } from '../razorpay/razorpay.service';
import { MembershipService } from '../membership/membership.service';

@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly razorpayService: RazorpayService,
    private readonly membershipService: MembershipService,
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
    const event = JSON.parse(rawBody.toString()) as {
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

    this.logger.log(`Razorpay webhook: ${event.event}`);

    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        const payment = event.payload.payment?.entity;
        if (!payment) break;

        try {
          await this.membershipService.handleWebhookPayment({
            eventType: event.event,
            razorpayOrderId: payment.order_id,
            razorpayPaymentId: payment.id,
            status: payment.status,
            method: payment.method,
            rawPayload: event,
          });
        } catch (err) {
          // Log but don't fail — Razorpay retries on non-200 responses
          this.logger.error('Error processing webhook payment event', err);
        }
        break;
      }

      case 'payment.failed': {
        const payment = event.payload.payment?.entity;
        if (!payment) break;

        try {
          await this.membershipService.handleWebhookPaymentFailed({
            razorpayOrderId: payment.order_id,
            razorpayPaymentId: payment.id,
            errorCode: payment.error_code,
            errorDescription: payment.error_description,
            rawPayload: event,
          });
        } catch (err) {
          this.logger.error('Error processing webhook payment.failed event', err);
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled Razorpay event: ${event.event}`);
    }

    // Always return 200 so Razorpay doesn't retry
    return { received: true };
  }
}
