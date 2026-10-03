import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Webhook endpoints and the delivery queue. Deliveries are inserted in the same
 * transaction as the event (outbox) and picked up by the worker with
 * FOR UPDATE SKIP LOCKED.
 */
export class CreateWebhooks1790920000000 implements MigrationInterface {
  name = 'CreateWebhooks1790920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE webhook_endpoints (
        id             varchar(40)  PRIMARY KEY,
        merchant_id    varchar(40)  NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
        url            varchar(2048) NOT NULL,
        description    varchar(200),
        enabled_events text[]       NOT NULL CHECK (cardinality(enabled_events) > 0),
        -- Needed in clear to sign every delivery (like Stripe's whsec_).
        secret         varchar(64)  NOT NULL,
        status         varchar(10)  NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
        created_at     timestamptz(3) NOT NULL DEFAULT now(),
        updated_at     timestamptz(3) NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_webhook_endpoints_merchant ON webhook_endpoints (merchant_id, created_at)',
    );

    await queryRunner.query(`
      CREATE TABLE webhook_deliveries (
        id              varchar(40)  PRIMARY KEY,
        merchant_id     varchar(40)  NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
        endpoint_id     varchar(40)  NOT NULL REFERENCES webhook_endpoints (id) ON DELETE CASCADE,
        event_id        varchar(40)  NOT NULL REFERENCES events (id) ON DELETE CASCADE,
        event_type      varchar(64)  NOT NULL,
        status          varchar(10)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'succeeded', 'failed')),
        attempts        smallint     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        next_attempt_at timestamptz(3),
        last_attempt_at timestamptz(3),
        response_status smallint,
        response_body   varchar(500),
        error_code      varchar(32),
        duration_ms     integer,
        attempt_log     jsonb        NOT NULL DEFAULT '[]'::jsonb,
        delivered_at    timestamptz(3),
        created_at      timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT uq_webhook_deliveries_endpoint_event UNIQUE (endpoint_id, event_id),
        CONSTRAINT ck_webhook_deliveries_schedule CHECK (status <> 'pending' OR next_attempt_at IS NOT NULL)
      )
    `);
    // The worker's queue: only pending rows, ordered by due time.
    await queryRunner.query(
      `CREATE INDEX ix_webhook_deliveries_due ON webhook_deliveries (next_attempt_at) WHERE status = 'pending'`,
    );
    await queryRunner.query(
      'CREATE INDEX ix_webhook_deliveries_merchant_created ON webhook_deliveries (merchant_id, created_at DESC, id DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_webhook_deliveries_endpoint_created ON webhook_deliveries (endpoint_id, created_at DESC)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE webhook_deliveries');
    await queryRunner.query('DROP TABLE webhook_endpoints');
  }
}
