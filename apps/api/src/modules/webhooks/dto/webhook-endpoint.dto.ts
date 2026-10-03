import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EVENT_TYPES } from '../../../domain/events';
import {
  ALL_EVENTS,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_ENDPOINT_STATUSES,
  type WebhookDeliveryStatus,
  type WebhookEndpointStatus,
} from '../../../domain/webhooks';

const EVENT_CHOICES = [ALL_EVENTS, ...EVENT_TYPES];

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: 'https://tienda.example/webhooks/pasarela' })
  @IsString()
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({ example: 'Backend de la tienda' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({
    enum: EVENT_CHOICES,
    isArray: true,
    example: ['payment_intent.succeeded', 'refund.created'],
    description: '`*` subscribes to every event type.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EVENT_CHOICES.length)
  @ArrayUnique()
  @IsIn(EVENT_CHOICES, { each: true })
  enabled_events!: string[];
}

export class UpdateWebhookEndpointDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ enum: EVENT_CHOICES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EVENT_CHOICES.length)
  @ArrayUnique()
  @IsIn(EVENT_CHOICES, { each: true })
  enabled_events?: string[];

  @ApiPropertyOptional({ enum: WEBHOOK_ENDPOINT_STATUSES })
  @IsOptional()
  @IsIn(WEBHOOK_ENDPOINT_STATUSES)
  status?: WebhookEndpointStatus;
}

export class ListWebhookDeliveriesQueryDto {
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

  @ApiPropertyOptional({ example: 'we_1a2B3c4D5e6F7g8H9i0J1k2L' })
  @IsOptional()
  @Matches(/^we_[0-9A-Za-z]{24}$/)
  endpoint?: string;

  @ApiPropertyOptional({ example: 'evt_1a2B3c4D5e6F7g8H9i0J1k2L' })
  @IsOptional()
  @Matches(/^evt_[0-9A-Za-z]{24}$/)
  event?: string;

  @ApiPropertyOptional({ enum: WEBHOOK_DELIVERY_STATUSES })
  @IsOptional()
  @IsIn(WEBHOOK_DELIVERY_STATUSES)
  status?: WebhookDeliveryStatus;
}
