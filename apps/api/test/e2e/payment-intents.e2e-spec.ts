import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { registerMerchant } from '../utils/auth';
import {
  checkoutAuthenticate,
  checkoutConfirm,
  createIntent,
  futureYear,
  tokenizeCard,
} from '../utils/payments';
import { createTestApp, type TestContext } from '../utils/test-app';

type Merchant = Awaited<ReturnType<typeof registerMerchant>>;

describe('Payment intents, cards and checkout (e2e)', () => {
  let ctx: TestContext;
  let merchant: Merchant;
  const http = () => request(ctx.app.getHttpServer());
  const sk = () => `Bearer ${merchant.secretKey}`;

  const eventTypes = async (piId: string) =>
    (
      await ctx.dataSource.query<{ type: string }[]>(
        'SELECT type FROM events WHERE payment_intent_id = $1 ORDER BY created_at, id',
        [piId],
      )
    ).map((e) => e.type);

  beforeAll(async () => {
    ctx = await createTestApp();
    merchant = await registerMerchant(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('POST /payment_intents', () => {
    it('creates an intent awaiting a payment method, idempotently', async () => {
      const key = randomUUID();
      const body = { amount: 4_990_000, description: 'Pedido #1042', metadata: { order: '1042' } };
      const first = await http()
        .post('/api/v1/payment_intents')
        .set('Authorization', sk())
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      expect(first.body).toMatchObject({
        id: expect.stringMatching(/^pi_\w{24}$/),
        object: 'payment_intent',
        amount: 4_990_000,
        amount_received: 0,
        amount_refunded: 0,
        currency: 'COP',
        status: 'requires_payment_method',
        payment_method_types: ['card', 'pse', 'nequi'],
        payment_method: null,
        metadata: { order: '1042' },
        livemode: false,
      });
      expect(first.body.client_secret).toMatch(new RegExp(`^${first.body.id}_secret_\\w{24}$`));

      const replay = await http()
        .post('/api/v1/payment_intents')
        .set('Authorization', sk())
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.body.id).toBe(first.body.id);

      const reused = await http()
        .post('/api/v1/payment_intents')
        .set('Authorization', sk())
        .set('Idempotency-Key', key)
        .send({ ...body, amount: 5_000_000 })
        .expect(422);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await eventTypes(first.body.id)).toEqual(['payment_intent.created']);
    });

    it('validates amount, currency, metadata and requires an Idempotency-Key', async () => {
      const bad = await http()
        .post('/api/v1/payment_intents')
        .set('Authorization', sk())
        .set('Idempotency-Key', randomUUID())
        .send({ amount: 99, currency: 'USD', metadata: { a: 1 } })
        .expect(400);
      expect(bad.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('amount must not be less than 100000'),
          expect.stringContaining('currency'),
          expect.stringContaining('metadata'),
        ]),
      );
      const noKey = await http()
        .post('/api/v1/payment_intents')
        .set('Authorization', sk())
        .send({ amount: 100_000 })
        .expect(400);
      expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('requires the secret key', async () => {
      await http()
        .post('/api/v1/payment_intents')
        .set('Authorization', `Bearer ${merchant.publishableKey}`)
        .set('Idempotency-Key', randomUUID())
        .send({ amount: 100_000 })
        .expect(401);
    });
  });

  describe('POST /payment_methods (tokenization)', () => {
    it('returns display data only and never stores the card number or CVC', async () => {
      const res = await http()
        .post('/api/v1/payment_methods')
        .set('Authorization', `Bearer ${merchant.publishableKey}`)
        .send({
          type: 'card',
          card: { number: '4242 4242 4242 4242', exp_month: 7, exp_year: 31, cvc: '314' },
        })
        .expect(201);
      expect(res.body).toMatchObject({
        id: expect.stringMatching(/^pm_\w{24}$/),
        object: 'payment_method',
        type: 'card',
        card: { brand: 'visa', last4: '4242', exp_month: 7, exp_year: 2031, funding: 'credit' },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/4242424242424242|314|simulated/);

      const [row] = await ctx.dataSource.query('SELECT * FROM payment_methods WHERE id = $1', [
        res.body.id,
      ]);
      expect(JSON.stringify(row)).not.toMatch(/4242424242424242|"314"/);
    });

    it.each([
      ['a bad checksum', { number: '4242424242424241' }, 'invalid_checksum'],
      ['an unsupported brand', { number: '9999999999999995' }, 'unknown_brand'],
      ['an expired card', { number: '4242424242424242', exp_year: 2020 }, 'invalid_expiry'],
      ['a short Amex CVC', { number: '378282246310005', cvc: '123' }, 'invalid_cvc'],
    ])('rejects %s', async (_label, card, reason) => {
      const res = await http()
        .post('/api/v1/payment_methods')
        .set('Authorization', `Bearer ${merchant.publishableKey}`)
        .send({
          type: 'card',
          card: { exp_month: 12, exp_year: futureYear(), cvc: '123', ...card },
        })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'INVALID_CARD', reason });
    });

    it('validates PSE banks and Nequi phones', async () => {
      const auth = `Bearer ${merchant.publishableKey}`;
      await http()
        .post('/api/v1/payment_methods')
        .set('Authorization', auth)
        .send({ type: 'pse', pse: { bank: '0000' } })
        .expect(400);
      await http()
        .post('/api/v1/payment_methods')
        .set('Authorization', auth)
        .send({ type: 'nequi', nequi: { phone: '12345' } })
        .expect(400);
      await http()
        .post('/api/v1/payment_methods')
        .set('Authorization', auth)
        .send({ type: 'card' })
        .expect(400);
    });
  });

  describe('confirming through the hosted checkout', () => {
    it('4242… succeeds and records processing → succeeded', async () => {
      const pi = await createIntent(ctx.app, merchant);
      const pm = await tokenizeCard(ctx.app, merchant, '4242424242424242');

      const res = await checkoutConfirm(ctx.app, pi, pm.id).expect(200);
      expect(res.body).toMatchObject({
        object: 'checkout',
        status: 'succeeded',
        merchant: { business_name: 'Tienda de Prueba' },
        publishable_key: merchant.publishableKey,
        payment_method: { card: { brand: 'visa', last4: '4242' } },
        attempts: 1,
      });
      expect(res.body).not.toHaveProperty('client_secret');
      expect(await eventTypes(pi.id)).toEqual([
        'payment_intent.created',
        'payment_intent.processing',
        'payment_intent.succeeded',
      ]);

      const again = await checkoutConfirm(ctx.app, pi, pm.id).expect(409);
      expect(again.body.code).toBe('PAYMENT_INTENT_UNEXPECTED_STATE');
    });

    it('a decline keeps the intent payable, and fails it after 3 attempts', async () => {
      const pi = await createIntent(ctx.app, merchant);
      const declined = await tokenizeCard(ctx.app, merchant, '4000000000009995');

      const first = await checkoutConfirm(ctx.app, pi, declined.id).expect(200);
      expect(first.body.status).toBe('requires_payment_method');
      expect(first.body.last_payment_error).toEqual({
        type: 'card_error',
        code: 'card_declined',
        decline_code: 'insufficient_funds',
        message: 'Your card has insufficient funds.',
        payment_method_type: 'card',
      });

      await checkoutConfirm(ctx.app, pi, declined.id).expect(200);
      const third = await checkoutConfirm(ctx.app, pi, declined.id).expect(200);
      expect(third.body).toMatchObject({ status: 'failed', attempts: 3 });

      const ok = await tokenizeCard(ctx.app, merchant, '4242424242424242');
      await checkoutConfirm(ctx.app, pi, ok.id).expect(409);
    });

    it('a retry after a decline can succeed with another card', async () => {
      const pi = await createIntent(ctx.app, merchant);
      const bad = await tokenizeCard(ctx.app, merchant, '4000000000000002');
      await checkoutConfirm(ctx.app, pi, bad.id).expect(200);
      const good = await tokenizeCard(ctx.app, merchant, '5555555555554444');
      const res = await checkoutConfirm(ctx.app, pi, good.id).expect(200);
      expect(res.body).toMatchObject({
        status: 'succeeded',
        last_payment_error: null,
        attempts: 2,
      });
    });

    it('3DS: requires_action, then approve → succeeded or reject → payable again', async () => {
      const pi = await createIntent(ctx.app, merchant);
      const pm = await tokenizeCard(ctx.app, merchant, '4000002760003184');
      const action = await checkoutConfirm(ctx.app, pi, pm.id).expect(200);
      expect(action.body).toMatchObject({
        status: 'requires_action',
        next_action: { type: 'three_d_secure', three_d_secure: { brand: 'visa', last4: '3184' } },
      });

      const rejected = await checkoutAuthenticate(ctx.app, pi, 'reject').expect(200);
      expect(rejected.body).toMatchObject({
        status: 'requires_payment_method',
        next_action: null,
        last_payment_error: { decline_code: 'authentication_failed' },
      });

      await checkoutConfirm(ctx.app, pi, pm.id).expect(200);
      const approved = await checkoutAuthenticate(ctx.app, pi, 'approve').expect(200);
      expect(approved.body.status).toBe('succeeded');
      await checkoutAuthenticate(ctx.app, pi, 'approve').expect(409);
    });

    it('PSE goes through the simulated bank and Nequi through a push approval', async () => {
      const pse = await createIntent(ctx.app, merchant);
      const psePm = await http()
        .post('/api/v1/payment_methods')
        .set('Authorization', `Bearer ${merchant.publishableKey}`)
        .send({ type: 'pse', pse: { bank: '1002', person_type: 'natural' } })
        .expect(201);
      const redirect = await checkoutConfirm(ctx.app, pse, psePm.body.id).expect(200);
      expect(redirect.body.next_action).toEqual({
        type: 'pse_redirect',
        pse_redirect: { bank_code: '1002', bank_name: 'Banco Caribe de Prueba' },
      });
      expect((await checkoutAuthenticate(ctx.app, pse, 'approve')).body.status).toBe('succeeded');

      const nequi = await createIntent(ctx.app, merchant);
      const nequiPm = await http()
        .post('/api/v1/payment_methods')
        .set('Authorization', `Bearer ${merchant.publishableKey}`)
        .send({ type: 'nequi', nequi: { phone: '300 123 4567' } })
        .expect(201);
      expect(nequiPm.body.nequi).toEqual({ phone_last4: '4567' });
      const push = await checkoutConfirm(ctx.app, nequi, nequiPm.body.id).expect(200);
      expect(push.body.next_action.type).toBe('nequi_push');
      const rejected = await checkoutAuthenticate(ctx.app, nequi, 'reject').expect(200);
      expect(rejected.body.last_payment_error.decline_code).toBe('payment_rejected');
    });

    it('only accepts the payment method types allowed for the intent', async () => {
      const pi = await createIntent(ctx.app, merchant, { payment_method_types: ['pse'] });
      const card = await tokenizeCard(ctx.app, merchant, '4242424242424242');
      const res = await checkoutConfirm(ctx.app, pi, card.id).expect(422);
      expect(res.body.code).toBe('PAYMENT_METHOD_NOT_ALLOWED');
    });

    it('rejects a wrong client_secret and payment methods of another merchant', async () => {
      const pi = await createIntent(ctx.app, merchant);
      await http()
        .get(`/api/v1/checkout/${pi.id}`)
        .query({ client_secret: `${pi.id}_secret_${'x'.repeat(24)}` })
        .expect(404);
      await http().get(`/api/v1/checkout/${pi.id}`).expect(404);
      const view = await http()
        .get(`/api/v1/checkout/${pi.id}`)
        .query({ client_secret: pi.client_secret })
        .expect(200);
      expect(view.body.max_attempts).toBe(3);

      const other = await registerMerchant(ctx.app);
      const foreign = await tokenizeCard(ctx.app, other, '4242424242424242');
      const res = await checkoutConfirm(ctx.app, pi, foreign.id).expect(400);
      expect(res.body.code).toBe('INVALID_PAYMENT_METHOD');
    });

    it('a double-submitted confirm (same Idempotency-Key, in parallel) charges once', async () => {
      const pi = await createIntent(ctx.app, merchant);
      const pm = await tokenizeCard(ctx.app, merchant, '4242424242424242');
      const key = randomUUID();
      const results = await Promise.all([
        checkoutConfirm(ctx.app, pi, pm.id, key),
        checkoutConfirm(ctx.app, pi, pm.id, key),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results.filter((r) => r.headers['idempotent-replayed'] === 'true')).toHaveLength(1);
      expect(await eventTypes(pi.id)).toEqual([
        'payment_intent.created',
        'payment_intent.processing',
        'payment_intent.succeeded',
      ]);
    });
  });

  describe('server-side confirm, cancel and listing', () => {
    it('confirms with the secret key too', async () => {
      const pi = await createIntent(ctx.app, merchant);
      const pm = await tokenizeCard(ctx.app, merchant, '378282246310005');
      const res = await http()
        .post(`/api/v1/payment_intents/${pi.id}/confirm`)
        .set('Authorization', sk())
        .set('Idempotency-Key', randomUUID())
        .send({ payment_method: pm.id })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'succeeded',
        amount_received: 2_500_000,
        payment_method: { card: { brand: 'amex' } },
      });
    });

    it('cancels pending intents only', async () => {
      const pi = await createIntent(ctx.app, merchant);
      const res = await http()
        .post(`/api/v1/payment_intents/${pi.id}/cancel`)
        .set('Authorization', sk())
        .send({ cancellation_reason: 'requested_by_customer' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'canceled',
        cancellation_reason: 'requested_by_customer',
        canceled_at: expect.any(String),
      });
      await http()
        .post(`/api/v1/payment_intents/${pi.id}/cancel`)
        .set('Authorization', sk())
        .send({})
        .expect(409);
    });

    it('lists newest first with an opaque cursor and a status filter', async () => {
      const fresh = await registerMerchant(ctx.app);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push((await createIntent(ctx.app, fresh)).id);
      await http()
        .post(`/api/v1/payment_intents/${ids[0]}/cancel`)
        .set('Authorization', `Bearer ${fresh.secretKey}`)
        .send({})
        .expect(200);

      const page1 = await http()
        .get('/api/v1/payment_intents?limit=3')
        .set('Authorization', `Bearer ${fresh.secretKey}`)
        .expect(200);
      expect(page1.body).toMatchObject({ object: 'list', has_more: true });
      expect(page1.body.data.map((p: { id: string }) => p.id)).toEqual(ids.slice(2).reverse());

      const page2 = await http()
        .get('/api/v1/payment_intents')
        .query({ limit: 3, cursor: page1.body.next_cursor })
        .set('Authorization', `Bearer ${fresh.secretKey}`)
        .expect(200);
      expect(page2.body.data.map((p: { id: string }) => p.id)).toEqual(ids.slice(0, 2).reverse());
      expect(page2.body).toMatchObject({ has_more: false, next_cursor: null });

      const canceled = await http()
        .get('/api/v1/payment_intents?status=canceled')
        .set('Authorization', `Bearer ${fresh.secretKey}`)
        .expect(200);
      expect(canceled.body.data.map((p: { id: string }) => p.id)).toEqual([ids[0]]);

      await http()
        .get('/api/v1/payment_intents?cursor=nope')
        .set('Authorization', `Bearer ${fresh.secretKey}`)
        .expect(400);
    });

    it('never shows an intent to another merchant', async () => {
      const pi = await createIntent(ctx.app, merchant);
      const other = await registerMerchant(ctx.app);
      await http()
        .get(`/api/v1/payment_intents/${pi.id}`)
        .set('Authorization', `Bearer ${other.secretKey}`)
        .expect(404);
      await http().get('/api/v1/payment_intents/not-an-id').set('Authorization', sk()).expect(404);
    });
  });
});
