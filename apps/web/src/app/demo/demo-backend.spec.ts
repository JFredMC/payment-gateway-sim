import { TestBed } from '@angular/core/testing';
import { parseSignatureHeader, signedPayload } from '../domain/webhooks';
import { hmacSha256Hex } from './demo-db';
import {
  DEMO_CLOCK,
  DEMO_STORAGE,
  DEMO_STORAGE_KEY,
  DemoBackend,
  type DemoRequest,
  type DemoResponse,
} from './demo-backend';
import { DEMO_CREDENTIALS } from './demo-seed';
import { receiverBehavior, simulateSend } from './demo-webhooks';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('DemoBackend', () => {
  let backend: DemoBackend;
  let storage: MemoryStorage;
  let now: number;

  beforeEach(() => {
    storage = new MemoryStorage();
    now = Date.parse('2026-10-02T17:00:00.000Z');
    TestBed.configureTestingModule({
      providers: [
        { provide: DEMO_STORAGE, useValue: storage },
        { provide: DEMO_CLOCK, useValue: () => now },
      ],
    });
    backend = TestBed.inject(DemoBackend);
  });

  function call(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      query?: Record<string, string>;
    } = {},
  ): Promise<DemoResponse & { body: Body }> {
    const headers = options.headers ?? {};
    const req: DemoRequest = {
      method,
      path,
      query: options.query ?? {},
      header: (name) => headers[name] ?? null,
      body: options.body ?? null,
    };
    return backend.handle(req) as Promise<DemoResponse & { body: Body }>;
  }

  async function login(): Promise<Record<string, string>> {
    const [demo] = DEMO_CREDENTIALS;
    const res = await call('POST', '/auth/login', {
      body: { email: demo.email, password: demo.password },
    });
    expect(res.status).toBe(200);
    return { Authorization: `Bearer ${res.body['access_token']}` };
  }

  async function createIntent(auth: Record<string, string>, amount = 5_000_000) {
    const res = await call('POST', '/dashboard/payment-intents', {
      headers: { ...auth, 'Idempotency-Key': crypto.randomUUID() },
      body: { amount, description: 'Prueba' },
    });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function payWithCard(pi: Body, number: string) {
    const view = await call('GET', `/checkout/${pi['id']}`, {
      query: { client_secret: pi['client_secret'] },
    });
    const pm = await call('POST', '/payment_methods', {
      headers: { Authorization: `Bearer ${view.body['publishable_key']}` },
      body: {
        type: 'card',
        card: { number, exp_month: 12, exp_year: 2034, cvc: number.length === 15 ? '1234' : '123' },
      },
    });
    expect(pm.status).toBe(201);
    return call('POST', `/checkout/${pi['id']}/confirm`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: { client_secret: pi['client_secret'], payment_method: pm.body['id'] },
    });
  }

  it('seeds a merchant with payments in several states and logs in with the demo credentials', async () => {
    const auth = await login();
    const me = await call('GET', '/auth/me', { headers: auth });
    expect(me.body['merchant']['business_name']).toBe('Tienda Aurora');

    const list = await call('GET', '/dashboard/payment-intents', {
      headers: auth,
      query: { limit: '100' },
    });
    const statuses = new Set(list.body['data'].map((p: Body) => p['status']));
    for (const status of [
      'succeeded',
      'requires_payment_method',
      'requires_action',
      'failed',
      'canceled',
    ]) {
      expect(statuses).toContain(status);
    }
    const summary = await call('GET', '/dashboard/summary', {
      headers: auth,
      query: { days: '30' },
    });
    expect(summary.body['gross_volume']).toBeGreaterThan(0);
    expect(summary.body['daily']).toHaveLength(30);
    expect(summary.body['approval_rate']).toBeGreaterThan(0);
    expect(summary.body['approval_rate']).toBeLessThan(1);
  });

  it('rejects bad credentials and requests without a valid token (problem+json)', async () => {
    const res = await call('POST', '/auth/login', {
      body: { email: DEMO_CREDENTIALS[0].email, password: 'nope-1234' },
    });
    expect(res.status).toBe(401);
    expect(res.body['code']).toBe('INVALID_CREDENTIALS');
    expect(res.body['type']).toBe('https://errors.pasarela.dev/invalid-credentials');
    const anon = await call('GET', '/dashboard/summary');
    expect(anon.status).toBe(401);
  });

  it('tokenizes cards without ever storing the PAN or the CVC', async () => {
    const auth = await login();
    const pi = await createIntent(auth);
    const res = await payWithCard(pi, '4242424242424242');
    expect(res.status).toBe(200);
    expect(res.body['status']).toBe('succeeded');
    expect(res.body['payment_method']['card']).toMatchObject({ brand: 'visa', last4: '4242' });
    const stored = storage.getItem(DEMO_STORAGE_KEY)!;
    expect(stored).not.toContain('4242424242424242');
    expect(stored).not.toContain('"cvc"');
  });

  it('validates cards with Luhn and the brand rules', async () => {
    const auth = await login();
    const pi = await createIntent(auth);
    const view = await call('GET', `/checkout/${pi['id']}`, {
      query: { client_secret: pi['client_secret'] },
    });
    const res = await call('POST', '/payment_methods', {
      headers: { Authorization: `Bearer ${view.body['publishable_key']}` },
      body: {
        type: 'card',
        card: { number: '4242424242424241', exp_month: 12, exp_year: 2034, cvc: '123' },
      },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CARD', reason: 'invalid_checksum' });
  });

  it('declines, then exhausts the attempts; 3DS waits for the buyer', async () => {
    const auth = await login();
    const pi = await createIntent(auth);
    const first = await payWithCard(pi, '4000000000009995');
    expect(first.body['status']).toBe('requires_payment_method');
    expect(first.body['last_payment_error']['decline_code']).toBe('insufficient_funds');
    await payWithCard(pi, '4000000000000002');
    const third = await payWithCard(pi, '4000000000000002');
    expect(third.body['status']).toBe('failed');

    const other = await createIntent(auth);
    const challenge = await payWithCard(other, '4000002760003184');
    expect(challenge.body['status']).toBe('requires_action');
    expect(challenge.body['next_action']['type']).toBe('three_d_secure');
    const approved = await call('POST', `/checkout/${other['id']}/authenticate`, {
      body: { client_secret: other['client_secret'], result: 'approve' },
    });
    expect(approved.body['status']).toBe('succeeded');
  });

  it('replays an Idempotency-Key and refuses it for a different request', async () => {
    const auth = await login();
    const key = crypto.randomUUID();
    const send = (amount: number) =>
      call('POST', '/dashboard/payment-intents', {
        headers: { ...auth, 'Idempotency-Key': key },
        body: { amount },
      });
    const a = await send(1_000_000);
    const b = await send(1_000_000);
    expect(b.body['id']).toBe(a.body['id']);
    expect(b.headers?.['Idempotent-Replayed']).toBe('true');
    const c = await send(2_000_000);
    expect(c.status).toBe(422);
    expect(c.body['code']).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('refunds partially and never beyond the amount', async () => {
    const auth = await login();
    const pi = await createIntent(auth, 5_000_000);
    await payWithCard(pi, '4242424242424242');
    const refund = (amount?: number) =>
      call('POST', `/dashboard/payment-intents/${pi['id']}/refunds`, {
        headers: { ...auth, 'Idempotency-Key': crypto.randomUUID() },
        body: amount ? { amount } : {},
      });
    expect((await refund(2_000_000)).status).toBe(201);
    const tooMuch = await refund(4_000_000);
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body).toMatchObject({
      code: 'REFUND_EXCEEDS_AMOUNT',
      refundable_amount: 3_000_000,
    });
    expect((await refund()).body['amount']).toBe(3_000_000);
    const detail = await call('GET', `/dashboard/payment-intents/${pi['id']}`, { headers: auth });
    expect(detail.body['payment_intent']['refund_status']).toBe('full');
    expect(detail.body['refunds']).toHaveLength(2);
    expect(detail.body['timeline'].map((e: Body) => e['type'])).toEqual([
      'payment_intent.created',
      'payment_intent.processing',
      'payment_intent.succeeded',
      'refund.created',
      'refund.created',
    ]);
  });

  it('delivers signed webhooks and retries failures with backoff', async () => {
    const auth = await login();
    const created = await call('POST', '/dashboard/webhook-endpoints', {
      headers: auth,
      body: { url: 'https://receptor.example/falla', enabled_events: ['payment_intent.succeeded'] },
    });
    expect(created.status).toBe(201);
    const pi = await createIntent(auth);
    await payWithCard(pi, '4242424242424242');

    const list = await call('GET', '/dashboard/webhook-deliveries', {
      headers: auth,
      query: { endpoint: created.body['id'] },
    });
    const [delivery] = list.body['data'];
    expect(delivery).toMatchObject({ status: 'pending', attempts: 1, response_status: 500 });
    const next = Date.parse(delivery['next_attempt_at']) - now;
    expect(next).toBeGreaterThanOrEqual(9_000);
    expect(next).toBeLessThanOrEqual(11_000);

    // Fix the receiver and let the retry run as time passes.
    await call('PATCH', `/dashboard/webhook-endpoints/${created.body['id']}`, {
      headers: auth,
      body: { url: 'https://receptor.example/ok' },
    });
    now += 12_000;
    const again = await call('GET', `/dashboard/webhook-deliveries/${delivery['id']}`, {
      headers: auth,
    });
    expect(again.body).toMatchObject({ status: 'succeeded', attempts: 2, response_status: 200 });
    expect(again.body['payload']['type']).toBe('payment_intent.succeeded');
  });

  it('signs with HMAC-SHA256 over "t.body" so a receiver can verify it', async () => {
    const endpoint = {
      id: 'we_x',
      merchantId: 'acct_x',
      url: 'https://receptor.example/ok',
      description: null,
      enabledEvents: ['*'],
      status: 'enabled' as const,
      secret: 'whsec_test',
      createdAt: '',
      updatedAt: '',
    };
    const outcome = await simulateSend(endpoint, '{"id":"evt_1"}', now);
    expect(outcome).toMatchObject({ responseStatus: 200, errorCode: null });
    expect(outcome.responseBody).toContain('"firma_valida":true');
    const t = Math.floor(now / 1000);
    const expected = await hmacSha256Hex('whsec_test', signedPayload(t, '{"id":"evt_1"}'));
    expect(parseSignatureHeader(`t=${t},v1=${expected}`)?.signatures).toEqual([expected]);
    expect(receiverBehavior('https://x.invalid/hook')).toBe('connection_error');
    expect(receiverBehavior('https://x.example/timeout')).toBe('timeout');
  });

  it('rejects non-https webhook URLs and resets to the sample data', async () => {
    const auth = await login();
    const res = await call('POST', '/dashboard/webhook-endpoints', {
      headers: auth,
      body: { url: 'http://localhost:3000/hook', enabled_events: ['*'] },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_WEBHOOK_URL', reason: 'https_required' });

    await call('POST', '/auth/register', {
      body: {
        email: 'nuevo@demo.co',
        password: 'Clave1234',
        full_name: 'Nuevo',
        business_name: 'Nuevo',
      },
    });
    await backend.reset();
    const again = await call('POST', '/auth/login', {
      body: { email: 'nuevo@demo.co', password: 'Clave1234' },
    });
    expect(again.status).toBe(401);
  });
});
