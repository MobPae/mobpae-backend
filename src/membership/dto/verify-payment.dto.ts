import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPaymentDto {
  @ApiProperty({ description: 'Razorpay order ID (rzp_order_...)', example: 'order_abc123' })
  @IsString()
  razorpayOrderId: string;

  @ApiProperty({ description: 'Razorpay payment ID from checkout handler', example: 'pay_abc123' })
  @IsString()
  razorpayPaymentId: string;

  @ApiProperty({ description: 'HMAC-SHA256 signature from Razorpay checkout handler' })
  @IsString()
  razorpaySignature: string;
}
