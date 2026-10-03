import { type APIRequestContext, expect } from '@playwright/test';
import { PASSWORD, uniqueEmail } from './helpers';

/** Merchant-server side of the tests: talks to the API like a merchant backend would. */

export interface ApiMerchant {
  email: string;
  accessToken: string;
  secretKey: string;
}

export async function createMerchantViaApi(
  request: APIRequestContext,
  businessName = 'Tienda Playwright',
): Promise<ApiMerchant> {
  const email = uniqueEmail('api');
  const register = await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, full_name: 'Ana Gómez', business_name: businessName },
  });
  expect(register.status()).toBe(201);
  const { access_token: accessToken } = (await register.json()) as { access_token: string };

  const roll = await request.post('/api/v1/dashboard/api-keys/roll', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { type: 'secret' },
  });
  expect(roll.status()).toBe(200);
  const { secret } = (await roll.json()) as { secret: string };
  return { email, accessToken, secretKey: secret };
}

export interface ApiIntent {
  id: string;
  client_secret: string;
}

export async function createIntentViaApi(
  request: APIRequestContext,
  merchant: ApiMerchant,
  body: Record<string, unknown> = {},
): Promise<ApiIntent> {
  const res = await request.post('/api/v1/payment_intents', {
    headers: {
      Authorization: `Bearer ${merchant.secretKey}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { amount: 8_990_000, description: 'Audífonos inalámbricos', ...body },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as ApiIntent;
}

export const checkoutPath = (intent: ApiIntent) =>
  `/checkout/${intent.id}?secret=${encodeURIComponent(intent.client_secret)}`;

export async function refundViaApi(
  request: APIRequestContext,
  merchant: ApiMerchant,
  paymentIntent: string,
  amount?: number,
) {
  const res = await request.post('/api/v1/refunds', {
    headers: {
      Authorization: `Bearer ${merchant.secretKey}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { payment_intent: paymentIntent, ...(amount ? { amount } : {}) },
  });
  expect(res.status()).toBe(201);
}
