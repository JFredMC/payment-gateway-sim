import request from 'supertest';
import { createTestApp, type TestContext } from '../utils/test-app';

describe('Health (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /api/v1/health is public and reports the database as up', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } });
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('propagates a well-formed X-Request-Id', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'trace-12345678')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('trace-12345678');
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/health',
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/auth/me',
        '/api/v1/account',
        '/api/v1/dashboard/api-keys',
        '/api/v1/dashboard/api-keys/roll',
      ]),
    );
    expect(Object.keys(res.body.components.securitySchemes)).toEqual(
      expect.arrayContaining(['bearer', 'secret_key', 'publishable_key']),
    );
  });

  it('returns RFC 9457 problem details for unknown routes', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND', instance: '/api/v1/nope' });
  });
});
