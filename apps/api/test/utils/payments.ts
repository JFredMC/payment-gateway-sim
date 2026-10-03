import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

export interface MerchantKeys {
  secretKey: string;
  publishableKey: string;
}

export const futureYear = () => new Date().getUTCFullYear() + 3;

export async function createIntent(
  app: INestApplication<App>,
  keys: MerchantKeys,
  body: Record<string, unknown> = {},
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/payment_intents')
    .set('Authorization', `Bearer ${keys.secretKey}`)
    .set('Idempotency-Key', randomUUID())
    .send({ amount: 2_500_000, description: 'Pedido de prueba', ...body })
    .expect(201);
  return res.body as { id: string; client_secret: string; status: string };
}

export async function tokenizeCard(
  app: INestApplication<App>,
  keys: MerchantKeys,
  number: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/payment_methods')
    .set('Authorization', `Bearer ${keys.publishableKey}`)
    .send({
      type: 'card',
      card: {
        number,
        exp_month: 12,
        exp_year: futureYear(),
        cvc: number.startsWith('3') ? '1234' : '123',
        ...overrides,
      },
      billing_details: { name: 'Ana Gómez' },
    })
    .expect(201);
  return res.body as { id: string };
}

/** Buyer-side confirm through the hosted-checkout endpoint. */
export function checkoutConfirm(
  app: INestApplication<App>,
  intent: { id: string; client_secret: string },
  paymentMethod: string,
  key: string = randomUUID(),
) {
  return request(app.getHttpServer())
    .post(`/api/v1/checkout/${intent.id}/confirm`)
    .set('Idempotency-Key', key)
    .send({ client_secret: intent.client_secret, payment_method: paymentMethod });
}

export function checkoutAuthenticate(
  app: INestApplication<App>,
  intent: { id: string; client_secret: string },
  result: 'approve' | 'reject',
) {
  return request(app.getHttpServer())
    .post(`/api/v1/checkout/${intent.id}/authenticate`)
    .send({ client_secret: intent.client_secret, result });
}
