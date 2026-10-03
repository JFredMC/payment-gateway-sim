import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { WebhookEndpointStatus } from '../../../domain/webhooks';

@Entity({ name: 'webhook_endpoints' })
export class WebhookEndpoint {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 40 })
  merchantId!: string;

  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  description!: string | null;

  @Column({ name: 'enabled_events', type: 'text', array: true })
  enabledEvents!: string[];

  @Column({ type: 'varchar', length: 64 })
  secret!: string;

  @Column({ type: 'varchar', length: 10, default: 'enabled' })
  status!: WebhookEndpointStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
  updatedAt!: Date;
}
