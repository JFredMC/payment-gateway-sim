import { ApiProperty } from '@nestjs/swagger';
import type { Merchant } from '../entities/merchant.entity';

/** `GET /account`: the merchant that owns the secret key. */
export class AccountDto {
  @ApiProperty({ example: 'acct_1a2B3c4D5e6F7g8H9i0J1k2L' })
  id!: string;

  @ApiProperty({ example: 'account' })
  object!: 'account';

  @ApiProperty({ example: 'Café La Montaña' })
  business_name!: string;

  @ApiProperty({ example: 'COP' })
  default_currency!: 'COP';

  @ApiProperty({ example: false, description: 'Always false: this gateway only has test mode.' })
  livemode!: false;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: string;

  static fromEntity(merchant: Merchant): AccountDto {
    return {
      id: merchant.id,
      object: 'account',
      business_name: merchant.businessName,
      default_currency: 'COP',
      livemode: false,
      created_at: merchant.createdAt.toISOString(),
    };
  }
}
