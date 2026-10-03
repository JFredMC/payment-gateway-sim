import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

export const DEFAULT_PASSWORD = 'S3cure-passw0rd';

let sequence = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}.${Date.now()}.${++sequence}@example.com`;

/** Extracts the refresh cookie ("refresh_token=<value>") from a Set-Cookie header. */
export function refreshCookieFrom(res: request.Response): string | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  return cookie?.split(';')[0];
}

export async function registerUser(
  app: INestApplication<App>,
  overrides: Partial<{
    email: string;
    password: string;
    full_name: string;
    business_name: string;
  }> = {},
) {
  const body = {
    email: uniqueEmail(),
    password: DEFAULT_PASSWORD,
    full_name: 'Test User',
    business_name: 'Tienda de Prueba',
    ...overrides,
  };
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send(body)
    .expect(201);
  return {
    ...body,
    accessToken: res.body.access_token as string,
    userId: res.body.user.id as string,
    merchantId: res.body.user.merchant.id as string,
    refreshCookie: refreshCookieFrom(res)!,
  };
}

/** Signs up a merchant and rolls its secret key (the only way to see it in full). */
export async function registerMerchant(app: INestApplication<App>) {
  const user = await registerUser(app);
  const keys = await request(app.getHttpServer())
    .get('/api/v1/dashboard/api-keys')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .expect(200);
  const publishableKey = (keys.body as { type: string; token: string }[]).find(
    (k) => k.type === 'publishable',
  )!.token;
  const rolled = await request(app.getHttpServer())
    .post('/api/v1/dashboard/api-keys/roll')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ type: 'secret' })
    .expect(200);
  return { ...user, publishableKey, secretKey: rolled.body.secret as string };
}
