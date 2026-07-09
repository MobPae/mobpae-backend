/**
 * RazorpayService
 *
 * Wraps all Razorpay API calls using Node's built-in https module.
 * No third-party npm package required — keeps the dependency tree lean.
 *
 * Signature verification uses Node's built-in crypto module.
 */
import * as crypto from 'crypto';
import * as https from 'https';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  offer_id: string | null;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
}

export interface CreateOrderParams {
  amount: number; // in paise
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly baseUrl = 'api.razorpay.com';

  constructor(private readonly config: ConfigService) {
    this.keyId = config.getOrThrow<string>('RAZORPAY_KEY_ID');
    this.keySecret = config.getOrThrow<string>('RAZORPAY_KEY_SECRET');
    this.webhookSecret = config.getOrThrow<string>('RAZORPAY_WEBHOOK_SECRET');
  }

  /** Create an order at Razorpay. Returns the full order object. */
  async createOrder(params: CreateOrderParams): Promise<RazorpayOrder> {
    const body = JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      receipt: params.receipt,
      ...(params.notes ? { notes: params.notes } : {}),
    });

    return this.request<RazorpayOrder>('POST', '/v1/orders', body);
  }

  /**
   * Verify the payment signature sent to the client's handler function.
   * Formula: HMAC-SHA256(order_id + '|' + payment_id, key_secret)
   */
  verifyPaymentSignature(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): boolean {
    const message = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(message)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(params.razorpaySignature, 'hex'),
    );
  }

  /**
   * Verify the webhook signature from the X-Razorpay-Signature header.
   * Formula: HMAC-SHA256(raw_body, webhook_secret)
   * Requires rawBody: true in NestFactory.create options.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      // timingSafeEqual throws if lengths differ
      return false;
    }
  }

  /** Get the public key ID (safe to expose to the client). */
  getKeyId(): string {
    return this.keyId;
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private request<T>(method: string, path: string, body?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString(
        'base64',
      );
      const options: https.RequestOptions = {
        hostname: this.baseUrl,
        path,
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          try {
            const parsed = JSON.parse(raw) as T;
            if ((res.statusCode ?? 200) >= 400) {
              this.logger.error(
                `Razorpay API error ${res.statusCode}: ${raw}`,
              );
              reject(new Error(`Razorpay API error ${res.statusCode}: ${raw}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Failed to parse Razorpay response: ${raw}`));
          }
        });
      });

      req.on('error', (err) => {
        this.logger.error('Razorpay request error', err);
        reject(err);
      });

      if (body) req.write(body);
      req.end();
    });
  }
}
