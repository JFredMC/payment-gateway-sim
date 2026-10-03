import { MigrationInterface, QueryRunner } from 'typeorm';

/** Merchants, their dashboard users (+ refresh tokens) and API keys. */
export class CreateMerchantsUsersAndApiKeys1790900000000 implements MigrationInterface {
  name = 'CreateMerchantsUsersAndApiKeys1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE merchants (
        id            varchar(40)  PRIMARY KEY,
        business_name varchar(120) NOT NULL,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        updated_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT chk_merchants_id CHECK (id LIKE 'acct\\_%')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id           varchar(40)  NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
        email                 citext       NOT NULL,
        password_hash         text         NOT NULL,
        full_name             varchar(120) NOT NULL,
        role                  varchar(20)  NOT NULL DEFAULT 'OWNER',
        status                varchar(20)  NOT NULL DEFAULT 'ACTIVE',
        failed_login_attempts int          NOT NULL DEFAULT 0,
        locked_until          timestamptz,
        created_at            timestamptz  NOT NULL DEFAULT now(),
        updated_at            timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email),
        CONSTRAINT chk_users_role CHECK (role IN ('OWNER')),
        CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'LOCKED', 'DISABLED')),
        CONSTRAINT chk_users_failed_login_attempts CHECK (failed_login_attempts >= 0)
      )
    `);
    await queryRunner.query('CREATE INDEX ix_users_merchant ON users (merchant_id)');

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        family_id      uuid        NOT NULL,
        token_hash     char(64)    NOT NULL,
        expires_at     timestamptz NOT NULL,
        revoked_at     timestamptz,
        replaced_by_id uuid        REFERENCES refresh_tokens (id) ON DELETE SET NULL,
        user_agent     text,
        ip             inet,
        created_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_refresh_tokens_token_hash UNIQUE (token_hash)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_refresh_tokens_user_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL',
    );
    await queryRunner.query('CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id)');

    await queryRunner.query(`
      CREATE TABLE api_keys (
        id                varchar(40) PRIMARY KEY,
        merchant_id       varchar(40) NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
        type              varchar(12) NOT NULL,
        token_hash        char(64)    NOT NULL,
        last4             char(4)     NOT NULL,
        publishable_token text,
        created_at        timestamptz NOT NULL DEFAULT now(),
        last_used_at      timestamptz,
        revoked_at        timestamptz,
        CONSTRAINT uq_api_keys_token_hash UNIQUE (token_hash),
        CONSTRAINT chk_api_keys_type CHECK (type IN ('publishable', 'secret')),
        -- Secret tokens are never stored in clear; publishable ones are public by design.
        CONSTRAINT chk_api_keys_clear_token CHECK ((type = 'publishable') = (publishable_token IS NOT NULL))
      )
    `);
    // At most one active key of each type per merchant.
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_api_keys_active ON api_keys (merchant_id, type) WHERE revoked_at IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE api_keys');
    await queryRunner.query('DROP TABLE refresh_tokens');
    await queryRunner.query('DROP TABLE users');
    await queryRunner.query('DROP TABLE merchants');
  }
}
