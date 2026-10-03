import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { CardBrand } from '../../../domain/cards';
import type { PaymentMethodType } from '../../../domain/payment-intent-state';

/**
 * A tokenized payment method. Only display data is kept: brand, last 4 and
 * expiry for cards. The PAN and CVC never reach the database or the logs.
 */
@Entity({ name: 'payment_methods' })
export class PaymentMethod {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 40 })
  merchantId!: string;

  @Column({ type: 'varchar', length: 10 })
  type!: PaymentMethodType;

  @Column({ name: 'card_brand', type: 'varchar', length: 16, nullable: true })
  cardBrand!: CardBrand | null;

  @Column({ name: 'card_last4', type: 'char', length: 4, nullable: true })
  cardLast4!: string | null;

  @Column({ name: 'card_exp_month', type: 'smallint', nullable: true })
  cardExpMonth!: number | null;

  @Column({ name: 'card_exp_year', type: 'smallint', nullable: true })
  cardExpYear!: number | null;

  @Column({ name: 'card_funding', type: 'varchar', length: 8, nullable: true })
  cardFunding!: 'credit' | 'debit' | null;

  @Column({ name: 'pse_bank_code', type: 'varchar', length: 8, nullable: true })
  pseBankCode!: string | null;

  @Column({ name: 'pse_person_type', type: 'varchar', length: 10, nullable: true })
  psePersonType!: string | null;

  @Column({ name: 'nequi_phone_last4', type: 'char', length: 4, nullable: true })
  nequiPhoneLast4!: string | null;

  @Column({ name: 'billing_name', type: 'varchar', length: 120, nullable: true })
  billingName!: string | null;

  @Column({ name: 'billing_email', type: 'citext', nullable: true })
  billingEmail!: string | null;

  /** Encoded SimulatedOutcome (domain/test-cards). Private: never serialized. */
  @Column({ name: 'simulated_outcome', type: 'varchar', length: 40 })
  simulatedOutcome!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
