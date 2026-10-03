import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { API_KEY_TYPES, type ApiKeyType } from '../entities/api-key.entity';

export class RollApiKeyDto {
  @ApiProperty({ enum: API_KEY_TYPES, example: 'secret' })
  @IsIn(API_KEY_TYPES)
  type!: ApiKeyType;
}
