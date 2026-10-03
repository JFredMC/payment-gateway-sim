import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export const API_KEY_TYPES = ['publishable', 'secret'] as const;
export type ApiKeyType = (typeof API_KEY_TYPES)[number];

/**
 * A merchant API key (test mode only). Only the SHA-256 of the token is stored;
 * the publishable token is also kept in clear because it is public by design
 * (it ships in the checkout page).
 */
@Entity({ name: 'api_keys' })
export class ApiKey {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 40 })
  merchantId!: string;

  @Column({ type: 'varchar', length: 12 })
  type!: ApiKeyType;

  @Column({ name: 'token_hash', type: 'char', length: 64, select: false })
  tokenHash!: string;

  @Column({ name: 'last4', type: 'char', length: 4 })
  last4!: string;

  @Column({ name: 'publishable_token', type: 'text', nullable: true })
  publishableToken!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
