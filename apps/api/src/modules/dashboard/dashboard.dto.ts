import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export const SUMMARY_PERIODS = [7, 30] as const;

export class SummaryQueryDto {
  @ApiPropertyOptional({ enum: SUMMARY_PERIODS, default: 7, description: 'Days (America/Bogota).' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(SUMMARY_PERIODS)
  days?: (typeof SUMMARY_PERIODS)[number];
}
