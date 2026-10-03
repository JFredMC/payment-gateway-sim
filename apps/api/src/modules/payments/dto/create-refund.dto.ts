import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { MAX_AMOUNT } from '../../../domain/payment-intent-state';
import { REFUND_REASONS, type RefundReason } from '../entities/refund.entity';

export class CreateRefundDto {
  @ApiProperty({ example: 'pi_1a2B3c4D5e6F7g8H9i0J1k2L' })
  @IsString()
  @Matches(/^pi_[0-9A-Za-z]{24}$/, { message: 'payment_intent must be a pi_ id' })
  payment_intent!: string;

  @ApiPropertyOptional({
    example: 1_000_000,
    description: 'Minor units. Defaults to the whole refundable amount (full refund).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount?: number;

  @ApiPropertyOptional({ enum: REFUND_REASONS })
  @IsOptional()
  @IsIn(REFUND_REASONS)
  reason?: RefundReason;
}
