import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyPlatformFeePaymentDto {
  @ApiProperty({
    description: 'Razorpay order ID returned by platform fee initiation',
    example: 'order_abc123',
  })
  @IsString()
  razorpayOrderId: string;

  @ApiProperty({
    description: 'Razorpay payment ID from the checkout handler',
    example: 'pay_abc123',
  })
  @IsString()
  razorpayPaymentId: string;

  @ApiProperty({
    description: 'HMAC-SHA256 signature from the Razorpay checkout handler',
  })
  @IsString()
  razorpaySignature: string;
}
