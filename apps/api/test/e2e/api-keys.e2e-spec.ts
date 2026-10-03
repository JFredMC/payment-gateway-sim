import request from 'supertest';
import { registerMerchant, registerUser } from '../utils/auth';
import { createTestApp, type TestContext } from '../utils/test-app';

describe('Merchants + API keys (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('sign-up issues one publishable and one (masked) secret key', async () => {
    const user = await registerUser(ctx.app);
    const res = await http()
      .get('/api/v1/dashboard/api-keys')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body).toEqual([
      expect.objectContaining({
        object: 'api_key',
        type: 'publishable',
        token: expect.stringMatching(/^pk_test_[0-9A-Za-z]{32}$/),
        last_used_at: null,
      }),
      expect.objectContaining({
        type: 'secret',
        token: expect.stringMatching(/^sk_test_…[0-9A-Za-z]{4}$/),
      }),
    ]);
    expect(res.body[1]).not.toHaveProperty('secret');

    // The secret itself is never stored: only its SHA-256.
    const rows: { type: string; token_hash: string; publishable_token: string | null }[] =
      await ctx.dataSource.query(
        'SELECT type, token_hash, publishable_token FROM api_keys WHERE merchant_id = $1',
        [user.merchantId],
      );
    const secret = rows.find((r) => r.type === 'secret')!;
    expect(secret.publishable_token).toBeNull();
    expect(secret.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the rolled secret key authenticates the merchant API; the old one stops working', async () => {
    const merchant = await registerMerchant(ctx.app);
    expect(merchant.secretKey).toMatch(/^sk_test_[0-9A-Za-z]{32}$/);

    const account = await http()
      .get('/api/v1/account')
      .set('Authorization', `Bearer ${merchant.secretKey}`)
      .expect(200);
    expect(account.body).toEqual({
      id: merchant.merchantId,
      object: 'account',
      business_name: 'Tienda de Prueba',
      default_currency: 'COP',
      livemode: false,
      created_at: expect.any(String),
    });

    const rolled = await http()
      .post('/api/v1/dashboard/api-keys/roll')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .send({ type: 'secret' })
      .expect(200);
    expect(rolled.body.secret).not.toBe(merchant.secretKey);

    const old = await http()
      .get('/api/v1/account')
      .set('Authorization', `Bearer ${merchant.secretKey}`)
      .expect(401);
    expect(old.body.code).toBe('INVALID_API_KEY');
    await http()
      .get('/api/v1/account')
      .set('Authorization', `Bearer ${rolled.body.secret}`)
      .expect(200);

    const list = await http()
      .get('/api/v1/dashboard/api-keys')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[1].last_used_at).toEqual(expect.any(String));
  });

  it('rejects publishable keys, dashboard JWTs and garbage on secret-key routes', async () => {
    const merchant = await registerMerchant(ctx.app);
    for (const auth of [
      `Bearer ${merchant.publishableKey}`,
      `Bearer ${merchant.accessToken}`,
      'Bearer sk_test_' + 'x'.repeat(32),
      'Basic abc',
    ]) {
      const res = await http().get('/api/v1/account').set('Authorization', auth).expect(401);
      expect(res.body.code).toBe('INVALID_API_KEY');
    }
    await http().get('/api/v1/account').expect(401);
  });

  it('API keys of one merchant never leak to another', async () => {
    const a = await registerMerchant(ctx.app);
    const b = await registerMerchant(ctx.app);
    const res = await http()
      .get('/api/v1/account')
      .set('Authorization', `Bearer ${b.secretKey}`)
      .expect(200);
    expect(res.body.id).toBe(b.merchantId);
    expect(res.body.id).not.toBe(a.merchantId);
  });

  it('dashboard key routes need the dashboard session', async () => {
    const merchant = await registerMerchant(ctx.app);
    await http().get('/api/v1/dashboard/api-keys').expect(401);
    await http()
      .get('/api/v1/dashboard/api-keys')
      .set('Authorization', `Bearer ${merchant.secretKey}`)
      .expect(401);
    const bad = await http()
      .post('/api/v1/dashboard/api-keys/roll')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .send({ type: 'admin' })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
  });
});
