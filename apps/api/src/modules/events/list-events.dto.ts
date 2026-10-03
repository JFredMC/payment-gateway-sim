import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { EVENT_TYPES, type EventType } from '../../domain/events';

export class ListEventsQueryDto {
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

  @ApiPropertyOptional({ enum: EVENT_TYPES })
  @IsOptional()
  @IsIn(EVENT_TYPES)
  type?: EventType;

  @ApiPropertyOptional({ example: 'pi_1a2B3c4D5e6F7g8H9i0J1k2L' })
  @IsOptional()
  @Matches(/^pi_[0-9A-Za-z]{24}$/)
  payment_intent?: string;
}
