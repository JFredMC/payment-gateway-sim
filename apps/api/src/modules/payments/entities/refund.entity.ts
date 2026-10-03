import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintNumberTransformer } from '../../../common/money/money';

export const REFUND_REASONS = ['duplicate', 'fraudulent', 'requested_by_customer'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

@Entity({ name: 'refunds' })
export class Refund {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 40 })
  merchantId!: string;

  @Column({ name: 'payment_intent_id', type: 'varchar', length: 40 })
  paymentIntentId!: string;

  @Column({ type: 'bigint', transformer: bigintNumberTransformer })
  amount!: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  reason!: RefundReason | null;

  @Column({ type: 'varchar', length: 16, default: 'succeeded' })
  status!: 'succeeded';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
