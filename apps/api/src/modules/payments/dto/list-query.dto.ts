import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  PAYMENT_INTENT_STATUSES,
  type PaymentIntentStatus,
} from '../../../domain/payment-intent-state';

export class ListPaymentIntentsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque `next_cursor` from the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ enum: PAYMENT_INTENT_STATUSES })
  @IsOptional()
  @IsIn(PAYMENT_INTENT_STATUSES)
  status?: PaymentIntentStatus;
}

export class ListRefundsQueryDto {
  @ApiPropertyOptional({ example: 'pi_1a2B3c4D5e6F7g8H9i0J1k2L' })
  @IsOptional()
  @Matches(/^pi_[0-9A-Za-z]{24}$/)
  payment_intent?: string;
}
