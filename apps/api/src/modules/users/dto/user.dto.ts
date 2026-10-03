import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES, type User, type UserRole } from '../entities/user.entity';

export class UserMerchantDto {
  @ApiProperty({ example: 'acct_1a2B3c4D5e6F7g8H9i0J1k2L' })
  id!: string;

  @ApiProperty({ example: 'Café La Montaña' })
  business_name!: string;
}

/** Public representation of a dashboard user (never exposes the password hash). */
export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ana María Gómez' })
  full_name!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'OWNER' })
  role!: UserRole;

  @ApiProperty({ type: UserMerchantDto })
  merchant!: UserMerchantDto;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: string;

  /** `user.merchant` must be loaded. */
  static fromEntity(user: User): UserDto {
    if (!user.merchant) throw new Error('UserDto.fromEntity needs user.merchant loaded');
    return {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      merchant: { id: user.merchant.id, business_name: user.merchant.businessName },
      created_at: user.createdAt.toISOString(),
    };
  }
}
