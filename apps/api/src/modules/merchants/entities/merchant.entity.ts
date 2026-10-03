import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** A business that accepts payments. Created together with its owner at sign-up. */
@Entity({ name: 'merchants' })
export class Merchant {
  /** Public id, e.g. `acct_…`. */
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ name: 'business_name', type: 'varchar', length: 120 })
  businessName!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
