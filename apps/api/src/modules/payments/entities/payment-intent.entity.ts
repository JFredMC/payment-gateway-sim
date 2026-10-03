import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintNumberTransformer } from '../../../common/money/money';
import type { PaymentIntentStatus, PaymentMethodType } from '../../../domain/payment-intent-state';
import { PaymentMethod } from './payment-method.entity';

export interface LastPaymentError {
  type: 'card_error' | 'payment_method_error';
  code: string;
  decline_code: string;
  message: string;
  payment_method_type: PaymentMethodType;
}

export type NextAction =
  | { type: 'three_d_secure'; three_d_secure: { brand: string; last4: string } }
  | { type: 'pse_redirect'; pse_redirect: { bank_code: string; bank_name: string } }
  | { type: 'nequi_push'; nequi_push: { phone: string } };

export const CANCELLATION_REASONS = [
  'duplicate',
  'fraudulent',
  'requested_by_customer',
  'abandoned',
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

@Entity({ name: 'payment_intents' })
export class PaymentIntent {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 40 })
  merchantId!: string;

  @Column({ type: 'bigint', transformer: bigintNumberTransformer })
  amount!: number;

  @Column({ type: 'char', length: 3, default: 'COP' })
  currency!: 'COP';

  @Column({ type: 'varchar', length: 32, default: 'requires_payment_method' })
  status!: PaymentIntentStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'customer_email', type: 'citext', nullable: true })
  customerEmail!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, string>;

  @Column({ name: 'payment_method_types', type: 'text', array: true })
  paymentMethodTypes!: PaymentMethodType[];

  /** Capability handed to the buyer's browser; scoped to this single intent. */
  @Column({ name: 'client_secret', type: 'varchar', length: 100 })
  clientSecret!: string;

  @Column({ name: 'payment_method_id', type: 'varchar', length: 40, nullable: true })
  paymentMethodId!: string | null;

  @ManyToOne(() => PaymentMethod, { nullable: true })
  @JoinColumn({ name: 'payment_method_id' })
  paymentMethod?: PaymentMethod | null;

  @Column({ name: 'last_payment_error', type: 'jsonb', nullable: true })
  lastPaymentError!: LastPaymentError | null;

  @Column({ name: 'next_action', type: 'jsonb', nullable: true })
  nextAction!: NextAction | null;

  @Column({ type: 'smallint', default: 0 })
  attempts!: number;

  @Column({
    name: 'amount_refunded',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  amountRefunded!: number;

  @Column({ name: 'return_url', type: 'text', nullable: true })
  returnUrl!: string | null;

  @Column({ name: 'cancellation_reason', type: 'varchar', length: 32, nullable: true })
  cancellationReason!: CancellationReason | null;

  @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
  canceledAt!: Date | null;

  @Column({ name: 'succeeded_at', type: 'timestamptz', nullable: true })
  succeededAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
