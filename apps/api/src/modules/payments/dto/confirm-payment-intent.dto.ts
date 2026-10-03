import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { CANCELLATION_REASONS, type CancellationReason } from '../entities/payment-intent.entity';

export class ConfirmPaymentIntentDto {
  @ApiProperty({ example: 'pm_1a2B3c4D5e6F7g8H9i0J1k2L' })
  @IsString()
  @Matches(/^pm_[0-9A-Za-z]{24}$/, { message: 'payment_method must be a pm_ id' })
  payment_method!: string;
}

export class CheckoutConfirmDto extends ConfirmPaymentIntentDto {
  @ApiProperty({ example: 'pi_…_secret_…' })
  @IsString()
  client_secret!: string;
}

export class CheckoutAuthenticateDto {
  @ApiProperty({ example: 'pi_…_secret_…' })
  @IsString()
  client_secret!: string;

  @ApiProperty({
    enum: ['approve', 'reject'],
    description: 'Outcome chosen on the simulated 3DS / bank / Nequi screen.',
  })
  @IsIn(['approve', 'reject'])
  result!: 'approve' | 'reject';
}

export class CancelPaymentIntentDto {
  @ApiProperty({ enum: CANCELLATION_REASONS, required: false })
  @IsOptional()
  @IsIn(CANCELLATION_REASONS)
  cancellation_reason?: CancellationReason;
}
