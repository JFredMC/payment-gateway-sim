import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { registerMerchant } from '../utils/auth';
import { checkoutConfirm, createIntent, tokenizeCard } from '../utils/payments';
import { createTestApp, type TestContext } from '../utils/test-app';

describe('Refunds (e2e)', () => {
  let ctx: TestContext;
  let merchant: Awaited<ReturnType<typeof registerMerchant>>;
  const http = () => request(ctx.app.getHttpServer());

  const refund = (body: Record<string, unknown>, key = randomUUID()) =>
    http()
      .post('/api/v1/refunds')
      .set('Authorization', `Bearer ${merchant.secretKey}`)
      .set('Idempotency-Key', key)
      .send(body);

  async function paidIntent(amount = 1_000_000) {
    const pi = await createIntent(ctx.app, merchant, { amount });
    const pm = await tokenizeCard(ctx.app, merchant, '4242424242424242');
    await checkoutConfirm(ctx.app, pi, pm.id).expect(200);
    return pi;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    merchant = await registerMerchant(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('partial then full refund, never more than the amount', async () => {
    const pi = await paidIntent(1_000_000);
    const partial = await refund({ payment_intent: pi.id, amount: 400_000, reason: 'duplicate' });
    expect(partial.status).toBe(201);
    expect(partial.body).toMatchObject({
      id: expect.stringMatching(/^re_\w{24}$/),
      object: 'refund',
      payment_intent: pi.id,
      amount: 400_000,
      reason: 'duplicate',
      status: 'succeeded',
    });

    const tooMuch = await refund({ payment_intent: pi.id, amount: 600_001 }).expect(422);
    expect(tooMuch.body).toMatchObject({
      code: 'REFUND_EXCEEDS_AMOUNT',
      refundable_amount: 600_000,
    });

    const rest = await refund({ payment_intent: pi.id }).expect(201);
    expect(rest.body.amount).toBe(600_000);

    const intent = await http()
      .get(`/api/v1/payment_intents/${pi.id}`)
      .set('Authorization', `Bearer ${merchant.secretKey}`)
      .expect(200);
    expect(intent.body).toMatchObject({
      status: 'succeeded',
      amount_refunded: 1_000_000,
      refund_status: 'full',
    });

    await refund({ payment_intent: pi.id, amount: 1 }).expect(422);
    const list = await http()
      .get('/api/v1/refunds')
      .query({ payment_intent: pi.id })
      .set('Authorization', `Bearer ${merchant.secretKey}`)
      .expect(200);
    expect(list.body).toHaveLength(2);
  });

  it('only refunds succeeded payments', async () => {
    const pi = await createIntent(ctx.app, merchant);
    const res = await refund({ payment_intent: pi.id }).expect(409);
    expect(res.body.code).toBe('PAYMENT_INTENT_UNEXPECTED_STATE');
  });

  it('parallel refunds with different keys cannot over-refund (row lock)', async () => {
    const pi = await paidIntent(1_000_000);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => refund({ payment_intent: pi.id, amount: 300_000 })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 422)).toHaveLength(2);
    const [row] = await ctx.dataSource.query(
      'SELECT amount_refunded FROM payment_intents WHERE id = $1',
      [pi.id],
    );
    expect(Number(row.amount_refunded)).toBe(900_000);
  });

  it('replays a refund retried with the same key', async () => {
    const pi = await paidIntent(1_000_000);
    const key = randomUUID();
    const first = await refund({ payment_intent: pi.id, amount: 100_000 }, key).expect(201);
    const retry = await refund({ payment_intent: pi.id, amount: 100_000 }, key).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    const types = await ctx.dataSource.query<{ type: string }[]>(
      "SELECT type FROM events WHERE payment_intent_id = $1 AND type = 'refund.created'",
      [pi.id],
    );
    expect(types).toHaveLength(1);
  });
});
