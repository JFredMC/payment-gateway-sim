import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Merchant } from '../../merchants/entities/merchant.entity';

/** Every dashboard user owns its merchant (no team roles in this simulator). */
export const USER_ROLES = ['OWNER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'LOCKED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 40 })
  merchantId!: string;

  @ManyToOne(() => Merchant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant?: Merchant;

  @Column({ type: 'citext' })
  email!: string;

  /** argon2id hash. Never selected unless explicitly requested. */
  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName!: string;

  @Column({ type: 'varchar', length: 20, default: 'OWNER' })
  role!: UserRole;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: UserStatus;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
