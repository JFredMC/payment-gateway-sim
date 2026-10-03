import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { EventType } from '../../../domain/events';
import type { WebhookDeliveryStatus, WebhookErrorCode } from '../../../domain/webhooks';
import { GatewayEvent } from '../../events/entities/event.entity';
import { WebhookEndpoint } from './webhook-endpoint.entity';

/** One attempt, as shown in the dashboard's delivery log. */
export interface DeliveryAttempt {
  attempt: number;
  at: string;
  response_status: number | null;
  duration_ms: number;
  error_code: WebhookErrorCode | null;
  manual: boolean;
}

@Entity({ name: 'webhook_deliveries' })
export class WebhookDelivery {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 40 })
  merchantId!: string;

  @Column({ name: 'endpoint_id', type: 'varchar', length: 40 })
  endpointId!: string;

  @ManyToOne(() => WebhookEndpoint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'endpoint_id' })
  endpoint?: WebhookEndpoint;

  @Column({ name: 'event_id', type: 'varchar', length: 40 })
  eventId!: string;

  @ManyToOne(() => GatewayEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: GatewayEvent;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: EventType;

  @Column({ type: 'varchar', length: 10, default: 'pending' })
  status!: WebhookDeliveryStatus;

  @Column({ type: 'smallint', default: 0 })
  attempts!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', precision: 3, nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', precision: 3, nullable: true })
  lastAttemptAt!: Date | null;

  @Column({ name: 'response_status', type: 'smallint', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'varchar', length: 500, nullable: true })
  responseBody!: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 32, nullable: true })
  errorCode!: WebhookErrorCode | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null;

  @Column({ name: 'attempt_log', type: 'jsonb', default: () => "'[]'::jsonb" })
  attemptLog!: DeliveryAttempt[];

  @Column({ name: 'delivered_at', type: 'timestamptz', precision: 3, nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;
}
