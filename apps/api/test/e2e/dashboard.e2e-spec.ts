import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { registerMerchant } from '../utils/auth';
import { checkoutConfirm, createIntent, tokenizeCard } from '../utils/payments';
import { createTestApp, type TestContext } from '../utils/test-app';

type Merchant = Awaited<ReturnType<typeof registerMerchant>>;

const bogotaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

describe('Dashboard (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  async function paid(merchant: Merchant, amount: number, card = '4242424242424242') {
    const pi = await createIntent(ctx.app, merchant, { amount });
    const pm = await tokenizeCard(ctx.app, merchant, card);
    await checkoutConfirm(ctx.app, pi, pm.id).expect(200);
    return pi;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('summarizes volume, refunds, approval rate and pending payments in COP', async () => {
    const merchant = await registerMerchant(ctx.app);
    const auth = `Bearer ${merchant.accessToken}`;
    const first = await paid(merchant, 1_500_000);
    await paid(merchant, 2_500_000);
    // A declined attempt (stays pending) and an untouched payment.
    await paid(merchant, 9_900_000, '4000000000000002');
    await createIntent(ctx.app, merchant, { amount: 300_000 });
    await http()
      .post(`/api/v1/dashboard/payment-intents/${first.id}/refunds`)
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: 500_000 })
      .expect(201);

    const { body } = await http()
      .get('/api/v1/dashboard/summary')
      .set('Authorization', auth)
      .expect(200);
    expect(body).toMatchObject({
      object: 'dashboard_summary',
      currency: 'COP',
      period: { days: 7, to: bogotaToday(), time_zone: 'America/Bogota' },
      gross_volume: 4_000_000,
      refunded_amount: 500_000,
      net_volume: 3_500_000,
      succeeded_count: 2,
      average_ticket: 2_000_000,
      failed_attempts: 1,
      approval_rate: 0.667,
      pending_count: 2,
      by_method: [{ type: 'card', count: 2, volume: 4_000_000 }],
    });
    expect(body.daily).toHaveLength(7);
    expect(body.daily.at(-1)).toEqual({ date: bogotaToday(), volume: 4_000_000, count: 2 });

    const month = await http()
      .get('/api/v1/dashboard/summary?days=30')
      .set('Authorization', auth)
      .expect(200);
    expect(month.body.daily).toHaveLength(30);
    await http().get('/api/v1/dashboard/summary?days=3').set('Authorization', auth).expect(400);
  });

  it('an empty merchant gets zeros and no approval rate', async () => {
    const merchant = await registerMerchant(ctx.app);
    const { body } = await http()
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .expect(200);
    expect(body).toMatchObject({
      gross_volume: 0,
      succeeded_count: 0,
      approval_rate: null,
      by_method: [],
    });
  });

  it('creates a test payment, shows its detail with timeline, refunds it and lists it', async () => {
    const merchant = await registerMerchant(ctx.app);
    const auth = `Bearer ${merchant.accessToken}`;
    const key = randomUUID();
    const created = await http()
      .post('/api/v1/dashboard/payment-intents')
      .set('Authorization', auth)
      .set('Idempotency-Key', key)
      .send({
        amount: 4_990_000,
        description: 'Camiseta talla M',
        payment_method_types: ['card', 'nequi'],
      })
      .expect(201);
    expect(created.body).toMatchObject({
      status: 'requires_payment_method',
      client_secret: expect.stringContaining(`${created.body.id}_secret_`),
      payment_method_types: ['card', 'nequi'],
    });
    const replay = await http()
      .post('/api/v1/dashboard/payment-intents')
      .set('Authorization', auth)
      .set('Idempotency-Key', key)
      .send({
        amount: 4_990_000,
        description: 'Camiseta talla M',
        payment_method_types: ['card', 'nequi'],
      })
      .expect(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');

    const pm = await tokenizeCard(ctx.app, merchant, '4242424242424242');
    await checkoutConfirm(ctx.app, created.body, pm.id).expect(200);
    await http()
      .post(`/api/v1/dashboard/payment-intents/${created.body.id}/refunds`)
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'requested_by_customer' })
      .expect(201);

    const detail = await http()
      .get(`/api/v1/dashboard/payment-intents/${created.body.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body).toMatchObject({
      object: 'payment_intent_detail',
      payment_intent: { id: created.body.id, status: 'succeeded', refund_status: 'full' },
      refunds: [{ amount: 4_990_000, reason: 'requested_by_customer' }],
      webhook_deliveries: [],
    });
    expect(detail.body.timeline.map((e: { type: string }) => e.type)).toEqual([
      'payment_intent.created',
      'payment_intent.processing',
      'payment_intent.succeeded',
      'refund.created',
    ]);

    const list = await http()
      .get('/api/v1/dashboard/payment-intents?status=succeeded')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.data.map((p: { id: string }) => p.id)).toEqual([created.body.id]);
  });

  it('cancels a pending payment and refuses to refund more than the balance', async () => {
    const merchant = await registerMerchant(ctx.app);
    const auth = `Bearer ${merchant.accessToken}`;
    const pending = await createIntent(ctx.app, merchant);
    const canceled = await http()
      .post(`/api/v1/dashboard/payment-intents/${pending.id}/cancel`)
      .set('Authorization', auth)
      .send({ cancellation_reason: 'abandoned' })
      .expect(200);
    expect(canceled.body).toMatchObject({ status: 'canceled', cancellation_reason: 'abandoned' });

    const pi = await paid(merchant, 1_000_000);
    const tooMuch = await http()
      .post(`/api/v1/dashboard/payment-intents/${pi.id}/refunds`)
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: 1_000_001 });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body).toMatchObject({
      code: 'REFUND_EXCEEDS_AMOUNT',
      refundable_amount: 1_000_000,
    });
  });

  it('is only reachable with the dashboard session of the owner', async () => {
    const owner = await registerMerchant(ctx.app);
    const other = await registerMerchant(ctx.app);
    const pi = await createIntent(ctx.app, owner);

    await http().get('/api/v1/dashboard/summary').expect(401);
    await http()
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${owner.secretKey}`)
      .expect(401);
    await http()
      .get(`/api/v1/dashboard/payment-intents/${pi.id}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
    const otherList = await http()
      .get('/api/v1/dashboard/payment-intents')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(200);
    expect(otherList.body.data).toEqual([]);
  });
});
