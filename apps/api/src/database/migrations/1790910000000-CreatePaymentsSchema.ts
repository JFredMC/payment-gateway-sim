import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Payment intents, tokenized payment methods (never a PAN), refunds, the event
 * log (timeline + webhook source) and idempotency keys.
 */
export class CreatePaymentsSchema1790910000000 implements MigrationInterface {
  name = 'CreatePaymentsSchema1790910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payment_methods (
        id                varchar(40)  PRIMARY KEY,
        merchant_id       varchar(40)  NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
        type              varchar(10)  NOT NULL,
        -- card: only display data. The PAN and CVC are never stored.
        card_brand        varchar(16),
        card_last4        char(4),
        card_exp_month    smallint,
        card_exp_year     smallint,
        card_funding      varchar(8),
        -- pse / nequi
        pse_bank_code     varchar(8),
        pse_person_type   varchar(10),
        nequi_phone_last4 char(4),
        billing_name      varchar(120),
        billing_email     citext,
        -- Decided at tokenization from the test card; never exposed by the API.
        simulated_outcome varchar(40)  NOT NULL,
        created_at        timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT chk_payment_methods_type CHECK (type IN ('card', 'pse', 'nequi')),
        CONSTRAINT chk_payment_methods_card CHECK (
          type <> 'card' OR (card_brand IS NOT NULL AND card_last4 ~ '^[0-9]{4}$'
                             AND card_exp_month BETWEEN 1 AND 12 AND card_exp_year >= 2000)
        ),
        CONSTRAINT chk_payment_methods_pse CHECK (type <> 'pse' OR pse_bank_code IS NOT NULL),
        CONSTRAINT chk_payment_methods_nequi CHECK (type <> 'nequi' OR nequi_phone_last4 IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE payment_intents (
        id                   varchar(40)  PRIMARY KEY,
        merchant_id          varchar(40)  NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
        amount               bigint       NOT NULL,
        currency             char(3)      NOT NULL DEFAULT 'COP',
        status               varchar(32)  NOT NULL DEFAULT 'requires_payment_method',
        description          varchar(255),
        customer_email       citext,
        metadata             jsonb        NOT NULL DEFAULT '{}',
        payment_method_types text[]       NOT NULL DEFAULT '{card,pse,nequi}',
        client_secret        varchar(100) NOT NULL,
        payment_method_id    varchar(40)  REFERENCES payment_methods (id),
        last_payment_error   jsonb,
        next_action          jsonb,
        attempts             smallint     NOT NULL DEFAULT 0,
        amount_refunded      bigint       NOT NULL DEFAULT 0,
        return_url           text,
        cancellation_reason  varchar(32),
        canceled_at          timestamptz,
        succeeded_at         timestamptz,
        -- Millisecond precision: a JS Date round-trips it exactly (keyset cursors).
        created_at           timestamptz(3) NOT NULL DEFAULT now(),
        updated_at           timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_payment_intents_client_secret UNIQUE (client_secret),
        CONSTRAINT chk_payment_intents_amount CHECK (amount > 0),
        CONSTRAINT chk_payment_intents_currency CHECK (currency = 'COP'),
        CONSTRAINT chk_payment_intents_status CHECK (status IN (
          'requires_payment_method', 'requires_action', 'processing',
          'succeeded', 'failed', 'canceled')),
        CONSTRAINT chk_payment_intents_attempts CHECK (attempts BETWEEN 0 AND 3),
        CONSTRAINT chk_payment_intents_refunded CHECK (
          amount_refunded >= 0 AND amount_refunded <= amount
          AND (amount_refunded = 0 OR status = 'succeeded')),
        CONSTRAINT chk_payment_intents_method_types CHECK (
          cardinality(payment_method_types) > 0
          AND payment_method_types <@ ARRAY['card', 'pse', 'nequi']::text[])
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_payment_intents_merchant_created ON payment_intents (merchant_id, created_at DESC, id DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_payment_intents_merchant_status ON payment_intents (merchant_id, status, created_at DESC)',
    );

    await queryRunner.query(`
      CREATE TABLE refunds (
        id                varchar(40) PRIMARY KEY,
        merchant_id       varchar(40) NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
        payment_intent_id varchar(40) NOT NULL REFERENCES payment_intents (id),
        amount            bigint      NOT NULL,
        reason            varchar(32),
        status            varchar(16) NOT NULL DEFAULT 'succeeded',
        created_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_refunds_amount CHECK (amount > 0),
        CONSTRAINT chk_refunds_reason CHECK (
          reason IS NULL OR reason IN ('duplicate', 'fraudulent', 'requested_by_customer')),
        CONSTRAINT chk_refunds_status CHECK (status IN ('succeeded'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_refunds_payment_intent ON refunds (payment_intent_id, created_at)',
    );

    await queryRunner.query(`
      CREATE TABLE events (
        id                varchar(40) PRIMARY KEY,
        merchant_id       varchar(40) NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
        type              varchar(64) NOT NULL,
        payment_intent_id varchar(40) REFERENCES payment_intents (id),
        -- Snapshot of the object right after the change (what webhooks deliver).
        data              jsonb       NOT NULL,
        -- clock_timestamp(): events of one transaction keep their real order.
        created_at        timestamptz(3) NOT NULL DEFAULT clock_timestamp()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_events_payment_intent ON events (payment_intent_id, created_at)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_events_merchant_created ON events (merchant_id, created_at DESC)',
    );

    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        merchant_id     varchar(40)  NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
        key             varchar(255) NOT NULL,
        scope           varchar(100) NOT NULL,
        request_hash    char(64)     NOT NULL,
        response_status smallint,
        response_body   jsonb,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        expires_at      timestamptz  NOT NULL,
        CONSTRAINT pk_idempotency_keys PRIMARY KEY (merchant_id, key)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_idempotency_keys_expires_at ON idempotency_keys (expires_at)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE idempotency_keys');
    await queryRunner.query('DROP TABLE events');
    await queryRunner.query('DROP TABLE refunds');
    await queryRunner.query('DROP TABLE payment_intents');
    await queryRunner.query('DROP TABLE payment_methods');
  }
}
