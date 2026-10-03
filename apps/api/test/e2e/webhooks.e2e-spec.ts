import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { MAX_WEBHOOK_ATTEMPTS } from '../../src/domain/webhooks';
import { WebhookDispatcher } from '../../src/modules/webhooks/webhook-dispatcher';
import { verifySignature } from '../../src/modules/webhooks/webhook-signature';
import { registerMerchant } from '../utils/auth';
import { checkoutConfirm, createIntent, tokenizeCard } from '../utils/payments';
import { createTestApp, type TestContext } from '../utils/test-app';
import { WebhookReceiver } from '../utils/webhook-receiver';

type Merchant = Awaited<ReturnType<typeof registerMerchant>>;

describe('Webhooks (e2e)', () => {
  let ctx: TestContext;
  let dispatcher: WebhookDispatcher;
  let receiver: WebhookReceiver;
  const http = () => request(ctx.app.getHttpServer());

  const createEndpoint = (merchant: Merchant, body: Record<string, unknown>) =>
    http()
      .post('/api/v1/dashboard/webhook-endpoints')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .send(body);

  const deliveries = (merchant: Merchant, query = '') =>
    http()
      .get(`/api/v1/dashboard/webhook-deliveries${query}`)
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .expect(200);

  async function paidIntent(merchant: Merchant) {
    const pi = await createIntent(ctx.app, merchant, { amount: 1_500_000 });
    const pm = await tokenizeCard(ctx.app, merchant, '4242424242424242');
    await checkoutConfirm(ctx.app, pi, pm.id).expect(200);
    return pi;
  }

  /** Makes every pending delivery due now (instead of waiting for the backoff). */
  const makeDue = () =>
    ctx.dataSource.query(
      `UPDATE webhook_deliveries SET next_attempt_at = now() - interval '1 second' WHERE status = 'pending'`,
    );

  beforeAll(async () => {
    ctx = await createTestApp();
    dispatcher = ctx.app.get(WebhookDispatcher);
    receiver = await new WebhookReceiver().start();
  });

  afterEach(async () => {
    receiver.reset();
    // Leftovers of one test must never be delivered during the next one.
    await ctx.dataSource.query(
      `UPDATE webhook_deliveries SET status = 'failed', next_attempt_at = NULL WHERE status = 'pending'`,
    );
  });

  afterAll(async () => {
    await receiver.stop();
    await ctx.app.close();
  });

  describe('endpoints', () => {
    it('creates an endpoint with a whsec_ secret, updates, rolls the secret and deletes it', async () => {
      const merchant = await registerMerchant(ctx.app);
      const created = await createEndpoint(merchant, {
        url: receiver.url,
        description: 'Backend de la tienda',
        enabled_events: ['refund.created', 'payment_intent.succeeded'],
      }).expect(201);
      expect(created.body).toMatchObject({
        id: expect.stringMatching(/^we_\w{24}$/),
        object: 'webhook_endpoint',
        url: receiver.url,
        status: 'enabled',
        enabled_events: ['payment_intent.succeeded', 'refund.created'],
        secret: expect.stringMatching(/^whsec_[0-9A-Za-z]{32}$/),
      });
      const id = created.body.id as string;
      const auth = `Bearer ${merchant.accessToken}`;

      const updated = await http()
        .patch(`/api/v1/dashboard/webhook-endpoints/${id}`)
        .set('Authorization', auth)
        .send({ status: 'disabled', enabled_events: ['*', 'refund.created'] })
        .expect(200);
      expect(updated.body).toMatchObject({ status: 'disabled', enabled_events: ['*'] });

      const rolled = await http()
        .post(`/api/v1/dashboard/webhook-endpoints/${id}/roll-secret`)
        .set('Authorization', auth)
        .expect(200);
      expect(rolled.body.secret).not.toBe(created.body.secret);

      const list = await http()
        .get('/api/v1/dashboard/webhook-endpoints')
        .set('Authorization', auth)
        .expect(200);
      expect(list.body.map((e: { id: string }) => e.id)).toEqual([id]);

      await http()
        .delete(`/api/v1/dashboard/webhook-endpoints/${id}`)
        .set('Authorization', auth)
        .expect(204);
      await http()
        .get(`/api/v1/dashboard/webhook-endpoints/${id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('validates the URL, the event types and the per-merchant limit', async () => {
      const merchant = await registerMerchant(ctx.app);
      const bad = await createEndpoint(merchant, {
        url: 'ftp://example.com',
        enabled_events: ['*'],
      });
      expect(bad.status).toBe(400);
      expect(bad.body).toMatchObject({ code: 'INVALID_WEBHOOK_URL', reason: 'invalid_url' });

      const unknownEvent = await createEndpoint(merchant, {
        url: receiver.url,
        enabled_events: ['charge.succeeded'],
      });
      expect(unknownEvent.status).toBe(400);
      expect(unknownEvent.body.code).toBe('VALIDATION_FAILED');

      for (let i = 0; i < 5; i++) {
        await createEndpoint(merchant, {
          url: `${receiver.url}/${i}`,
          enabled_events: ['*'],
        }).expect(201);
      }
      const sixth = await createEndpoint(merchant, { url: receiver.url, enabled_events: ['*'] });
      expect(sixth.status).toBe(422);
      expect(sixth.body).toMatchObject({ code: 'WEBHOOK_ENDPOINT_LIMIT', limit: 5 });
    });

    it('requires the dashboard session and isolates merchants', async () => {
      const owner = await registerMerchant(ctx.app);
      const other = await registerMerchant(ctx.app);
      const { body } = await createEndpoint(owner, {
        url: receiver.url,
        enabled_events: ['*'],
      }).expect(201);

      await http().get('/api/v1/dashboard/webhook-endpoints').expect(401);
      await http()
        .get('/api/v1/dashboard/webhook-endpoints')
        .set('Authorization', `Bearer ${owner.secretKey}`)
        .expect(401);
      await http()
        .get(`/api/v1/dashboard/webhook-endpoints/${body.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });

  describe('deliveries', () => {
    it('delivers every subscribed event, signed with HMAC-SHA256 over the raw body', async () => {
      const merchant = await registerMerchant(ctx.app);
      const { body: endpoint } = await createEndpoint(merchant, {
        url: receiver.url,
        enabled_events: ['*'],
      }).expect(201);

      const pi = await paidIntent(merchant);
      expect(await dispatcher.runOnce()).toBe(3);

      const types = receiver.received.map((r) => r.body.type).sort();
      expect(types).toEqual([
        'payment_intent.created',
        'payment_intent.processing',
        'payment_intent.succeeded',
      ]);
      for (const hook of receiver.received) {
        expect(hook.headers['content-type']).toBe('application/json');
        expect(hook.headers['pasarela-event-id']).toBe(hook.body.id);
        expect(hook.headers['pasarela-delivery-id']).toMatch(/^whdel_\w{24}$/);
        const signature = hook.headers['pasarela-signature'] as string;
        expect(signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
        expect(verifySignature(endpoint.secret, hook.rawBody, signature)).toBe(true);
        expect(verifySignature(endpoint.secret, `${hook.rawBody} `, signature)).toBe(false);
      }
      const succeeded = receiver.received.find((r) => r.body.type === 'payment_intent.succeeded')!;
      expect(succeeded.body).toMatchObject({
        object: 'event',
        livemode: false,
        data: { object: { id: pi.id, object: 'payment_intent', status: 'succeeded' } },
      });

      const log = await deliveries(merchant);
      expect(log.body.data).toHaveLength(3);
      expect(log.body.data[0]).toMatchObject({
        object: 'webhook_delivery',
        endpoint: { id: endpoint.id, url: receiver.url },
        status: 'succeeded',
        attempts: 1,
        max_attempts: MAX_WEBHOOK_ATTEMPTS,
        response_status: 200,
        error_code: null,
        next_attempt_at: null,
        event: { payment_intent: pi.id },
      });
      expect(log.body.data[0].attempt_log).toEqual([
        expect.objectContaining({ attempt: 1, response_status: 200, manual: false }),
      ]);

      // Nothing left to send.
      expect(await dispatcher.runOnce()).toBe(0);
    });

    it('only enqueues subscribed types, and nothing for disabled endpoints', async () => {
      const merchant = await registerMerchant(ctx.app);
      await createEndpoint(merchant, {
        url: receiver.url,
        enabled_events: ['payment_intent.succeeded'],
      }).expect(201);
      const { body: disabled } = await createEndpoint(merchant, {
        url: `${receiver.url}/off`,
        enabled_events: ['*'],
      }).expect(201);
      await http()
        .patch(`/api/v1/dashboard/webhook-endpoints/${disabled.id}`)
        .set('Authorization', `Bearer ${merchant.accessToken}`)
        .send({ status: 'disabled' })
        .expect(200);

      await paidIntent(merchant);
      await dispatcher.runOnce();
      expect(receiver.received.map((r) => r.body.type)).toEqual(['payment_intent.succeeded']);
      const log = await deliveries(merchant);
      expect(log.body.data).toHaveLength(1);
    });

    it('retries non-2xx answers with exponential backoff until acknowledged', async () => {
      const merchant = await registerMerchant(ctx.app);
      await createEndpoint(merchant, {
        url: receiver.url,
        enabled_events: ['payment_intent.created'],
      }).expect(201);
      receiver.status = 500;
      await createIntent(ctx.app, merchant);

      const before = Date.now();
      await dispatcher.runOnce();
      let [delivery] = (await deliveries(merchant)).body.data;
      expect(delivery).toMatchObject({
        status: 'pending',
        attempts: 1,
        response_status: 500,
        error_code: 'http_status',
        response_body: '{"received":true,"status":500}',
      });
      const wait = new Date(delivery.next_attempt_at).getTime() - before;
      expect(wait).toBeGreaterThan(8_000); // base 10 s +/- 10 % jitter
      expect(wait).toBeLessThan(12_500);

      // Not due yet: nothing is sent.
      expect(await dispatcher.runOnce()).toBe(0);

      receiver.status = 204;
      await makeDue();
      await dispatcher.runOnce();
      [delivery] = (await deliveries(merchant)).body.data;
      expect(delivery).toMatchObject({ status: 'succeeded', attempts: 2, response_status: 204 });
      expect(
        delivery.attempt_log.map((a: { response_status: number }) => a.response_status),
      ).toEqual([500, 204]);
      expect(receiver.received).toHaveLength(2);
      expect(receiver.received[0].body.id).toBe(receiver.received[1].body.id);
    });

    it(`gives up after ${MAX_WEBHOOK_ATTEMPTS} attempts; a manual retry can still deliver`, async () => {
      const merchant = await registerMerchant(ctx.app);
      await createEndpoint(merchant, {
        url: receiver.url,
        enabled_events: ['payment_intent.created'],
      }).expect(201);
      receiver.status = 503;
      await createIntent(ctx.app, merchant);

      for (let i = 0; i < MAX_WEBHOOK_ATTEMPTS; i++) {
        await makeDue();
        await dispatcher.runOnce();
      }
      let [delivery] = (await deliveries(merchant)).body.data;
      expect(delivery).toMatchObject({
        status: 'failed',
        attempts: MAX_WEBHOOK_ATTEMPTS,
        next_attempt_at: null,
      });
      await makeDue();
      expect(await dispatcher.runOnce()).toBe(0);

      receiver.status = 200;
      const retried = await http()
        .post(`/api/v1/dashboard/webhook-deliveries/${delivery.id}/retry`)
        .set('Authorization', `Bearer ${merchant.accessToken}`)
        .expect(200);
      expect(retried.body).toMatchObject({
        status: 'succeeded',
        attempts: MAX_WEBHOOK_ATTEMPTS + 1,
        payload: { object: 'event', type: 'payment_intent.created' },
      });
      expect(retried.body.attempt_log.at(-1)).toMatchObject({ manual: true, response_status: 200 });
      [delivery] = (await deliveries(merchant, '?status=succeeded')).body.data;
      expect(delivery.id).toBe(retried.body.id);
    });

    it('records timeouts and connection errors', async () => {
      const merchant = await registerMerchant(ctx.app);
      const slow = await createEndpoint(merchant, {
        url: receiver.url,
        enabled_events: ['payment_intent.created'],
      }).expect(201);
      await createEndpoint(merchant, {
        url: 'http://127.0.0.1:9/closed',
        enabled_events: ['payment_intent.created'],
      }).expect(201);
      receiver.delayMs = 1_500; // WEBHOOK_TIMEOUT_MS is 1000 in the e2e env
      await createIntent(ctx.app, merchant);
      await dispatcher.runOnce();

      const { data } = (await deliveries(merchant)).body;
      const byEndpoint = Object.fromEntries(
        data.map((d: { endpoint: { id: string }; error_code: string }) => [
          d.endpoint.id,
          d.error_code,
        ]),
      );
      expect(byEndpoint[slow.body.id]).toBe('timeout');
      expect(Object.values(byEndpoint).sort()).toEqual(['connection_error', 'timeout']);
    });

    it('a delivery is only visible to its merchant, with the payload in the detail view', async () => {
      const merchant = await registerMerchant(ctx.app);
      const other = await registerMerchant(ctx.app);
      await createEndpoint(merchant, { url: receiver.url, enabled_events: ['*'] }).expect(201);
      await createIntent(ctx.app, merchant);
      await dispatcher.runOnce();
      const [delivery] = (await deliveries(merchant)).body.data;

      const detail = await http()
        .get(`/api/v1/dashboard/webhook-deliveries/${delivery.id}`)
        .set('Authorization', `Bearer ${merchant.accessToken}`)
        .expect(200);
      expect(detail.body.payload).toMatchObject({
        id: delivery.event.id,
        type: 'payment_intent.created',
      });

      await http()
        .get(`/api/v1/dashboard/webhook-deliveries/${delivery.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
      await http()
        .post(`/api/v1/dashboard/webhook-deliveries/${delivery.id}/retry`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
      expect((await deliveries(other)).body.data).toEqual([]);
    });

    it('two workers never claim the same delivery', async () => {
      const merchant = await registerMerchant(ctx.app);
      await createEndpoint(merchant, { url: receiver.url, enabled_events: ['*'] }).expect(201);
      for (let i = 0; i < 4; i++) await createIntent(ctx.app, merchant);

      const [a, b] = await Promise.all([dispatcher.runOnce(2), dispatcher.runOnce(2)]);
      expect(a + b).toBe(4);
      expect(new Set(receiver.received.map((r) => r.body.id)).size).toBe(4);
    });
  });

  describe('events API', () => {
    it('lists the timeline of a payment and fetches one event (secret key)', async () => {
      const merchant = await registerMerchant(ctx.app);
      const pi = await paidIntent(merchant);
      const auth = `Bearer ${merchant.secretKey}`;

      const timeline = await http()
        .get(`/api/v1/events?payment_intent=${pi.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(timeline.body.data.map((e: { type: string }) => e.type)).toEqual([
        'payment_intent.succeeded',
        'payment_intent.processing',
        'payment_intent.created',
      ]);

      const first = timeline.body.data[2];
      const one = await http()
        .get(`/api/v1/events/${first.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(one.body).toEqual(first);

      await http()
        .get(`/api/v1/events/${first.id}`)
        .set('Authorization', `Bearer ${merchant.publishableKey}`)
        .expect(401);
      const filtered = await http()
        .get('/api/v1/events?type=payment_intent.created')
        .set('Authorization', auth)
        .set('Idempotency-Key', randomUUID())
        .expect(200);
      expect(
        filtered.body.data.every((e: { type: string }) => e.type === 'payment_intent.created'),
      ).toBe(true);
    });
  });
});
