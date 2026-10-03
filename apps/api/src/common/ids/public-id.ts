import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Random base62 string from a CSPRNG. Rejection sampling keeps every symbol
 * equally likely (no modulo bias).
 */
export function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += ALPHABET[byte % 62]; // 248 = 4 * 62
      if (out.length === length) break;
    }
  }
  return out;
}

/** Prefixes of the public object ids, Stripe-style (`pi_3Nf…`). */
export const ID_PREFIX = {
  merchant: 'acct',
  apiKey: 'key',
  paymentIntent: 'pi',
  paymentMethod: 'pm',
  refund: 're',
  event: 'evt',
  webhookEndpoint: 'we',
  webhookDelivery: 'whdel',
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

/** `newId('pi')` → `pi_7GxQ2…` (24 random base62 chars ≈ 143 bits). */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomBase62(24)}`;
}
