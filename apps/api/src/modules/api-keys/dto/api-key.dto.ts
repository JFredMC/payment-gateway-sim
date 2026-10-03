import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { maskApiKey } from '../api-key-token';
import { API_KEY_TYPES, type ApiKey, type ApiKeyType } from '../entities/api-key.entity';

export class ApiKeyDto {
  @ApiProperty({ example: 'key_1a2B3c4D5e6F7g8H9i0J1k2L' })
  id!: string;

  @ApiProperty({ example: 'api_key' })
  object!: 'api_key';

  @ApiProperty({ enum: API_KEY_TYPES })
  type!: ApiKeyType;

  @ApiProperty({
    example: 'sk_test_…a1B2',
    description: 'Full token for publishable keys; masked for secret keys.',
  })
  token!: string;

  @ApiPropertyOptional({
    example: 'sk_test_…',
    description: 'Only present in the roll response: the full secret, shown once.',
  })
  secret?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  last_used_at!: string | null;

  static fromEntity(key: ApiKey, secret?: string): ApiKeyDto {
    return {
      id: key.id,
      object: 'api_key',
      type: key.type,
      token: key.publishableToken ?? maskApiKey(key.type, key.last4),
      ...(secret ? { secret } : {}),
      created_at: key.createdAt.toISOString(),
      last_used_at: key.lastUsedAt?.toISOString() ?? null,
    };
  }
}
