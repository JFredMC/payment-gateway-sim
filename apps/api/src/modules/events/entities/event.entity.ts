import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { EventType } from '../../../domain/events';

/** Append-only log of what happened: the payment timeline and the webhook source. */
@Entity({ name: 'events' })
export class GatewayEvent {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 40 })
  merchantId!: string;

  @Column({ type: 'varchar', length: 64 })
  type!: EventType;

  @Column({ name: 'payment_intent_id', type: 'varchar', length: 40, nullable: true })
  paymentIntentId!: string | null;

  @Column({ type: 'jsonb' })
  data!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;
}
