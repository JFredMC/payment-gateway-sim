import type { CardBrand } from '../domain/cards';
import type { EventType } from '../domain/events';
import type { PsePersonType } from '../domain/local-methods';
import type { PaymentIntentStatus, PaymentMethodType } from '../domain/payment-intent-state';
import type {
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
  WebhookErrorCode,
} from '../domain/webhooks';

/**
 * The demo "database": plain JSON persisted to localStorage. Rows keep the
 * API's public field names where possible, so serializing them stays trivial.
 * Like the API, it never holds a card number: only brand, last 4, expiry and
 * the simulated outcome decided at tokenization.
 */

export const DEMO_DB_VERSION = 1;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Same defaults as the API (.env.example / docker-compose.yml). */
export const DEMO_LIMITS = {
  accessTokenTtlSeconds: 900,
  sessionTtlMs: 7 * DAY_MS,
  idempotencyTtlMs: DAY_MS,
  webhookRetryBaseSeconds: 10,
  maxEndpoints: 5,
} as const;

export interface DemoUser {
  id: string;
  email: string;
  fullName: string;
  role: 'OWNER';
  merchantId: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export interface DemoMerchant {
  id: string;
  businessName: string;
  createdAt: string;
}

export interface DemoApiKey {
  id: string;
  merchantId: string;
  type: 'publishable' | 'secret';
  /** Full token for publishable keys only (secret keys keep just the last 4, like the API). */
  publishableToken: string | null;
  last4: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface DemoPaymentMethod {
  id: string;
  merchantId: string;
  type: PaymentMethodType;
  card: {
    brand: CardBrand;
    last4: string;
    exp_month: number;
    exp_year: number;
    funding: 'credit' | 'debit';
  } | null;
  pse: { bank_code: string; person_type: PsePersonType } | null;
  nequi: { phone_last4: string } | null;
  billingName: string | null;
  billingEmail: string | null;
  /** encodeOutcome() of the simulated authorization (never exposed). */
  outcome: string;
  createdAt: string;
}

export interface DemoLastPaymentError {
  type: 'card_error' | 'payment_method_error';
  code: string;
  decline_code: string;
  message: string;
  payment_method_type: PaymentMethodType;
}

export type DemoNextAction =
  | { type: 'three_d_secure'; three_d_secure: { brand: string; last4: string } }
  | { type: 'pse_redirect'; pse_redirect: { bank_code: string; bank_name: string } }
  | { type: 'nequi_push'; nequi_push: { phone: string } };

export interface DemoPaymentIntent {
  id: string;
  seq: number;
  merchantId: string;
  amount: number;
  amountRefunded: number;
  status: PaymentIntentStatus;
  description: string | null;
  customerEmail: string | null;
  metadata: Record<string, string>;
  paymentMethodTypes: PaymentMethodType[];
  paymentMethodId: string | null;
  clientSecret: string;
  lastPaymentError: DemoLastPaymentError | null;
  nextAction: DemoNextAction | null;
  attempts: number;
  returnUrl: string | null;
  cancellationReason: string | null;
  canceledAt: string | null;
  succeededAt: string | null;
  createdAt: string;
}

export interface DemoRefund {
  id: string;
  merchantId: string;
  paymentIntentId: string;
  amount: number;
  reason: string | null;
  createdAt: string;
}

export interface DemoEvent {
  id: string;
  seq: number;
  merchantId: string;
  type: EventType;
  paymentIntentId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface DemoWebhookEndpoint {
  id: string;
  merchantId: string;
  url: string;
  description: string | null;
  enabledEvents: string[];
  status: WebhookEndpointStatus;
  secret: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoDeliveryAttempt {
  attempt: number;
  at: string;
  response_status: number | null;
  duration_ms: number;
  error_code: WebhookErrorCode | null;
  manual: boolean;
}

export interface DemoWebhookDelivery {
  id: string;
  seq: number;
  merchantId: string;
  endpointId: string;
  eventId: string;
  eventType: EventType;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: WebhookErrorCode | null;
  durationMs: number | null;
  attemptLog: DemoDeliveryAttempt[];
  deliveredAt: string | null;
  createdAt: string;
}

export interface DemoIdempotencyRecord {
  fingerprint: string;
  status: number;
  body: unknown;
  expiresAt: number;
}

/** The simulated HttpOnly refresh cookie: one session per browser. */
export interface DemoSession {
  sid: string;
  userId: string;
  expiresAt: number;
}

export interface DemoDb {
  version: typeof DEMO_DB_VERSION;
  seq: number;
  users: DemoUser[];
  merchants: DemoMerchant[];
  apiKeys: DemoApiKey[];
  paymentMethods: DemoPaymentMethod[];
  paymentIntents: DemoPaymentIntent[];
  refunds: DemoRefund[];
  events: DemoEvent[];
  endpoints: DemoWebhookEndpoint[];
  deliveries: DemoWebhookDelivery[];
  idempotency: Record<string, DemoIdempotencyRecord>;
  session: DemoSession | null;
}

export function emptyDb(): DemoDb {
  return {
    version: DEMO_DB_VERSION,
    seq: 0,
    users: [],
    merchants: [],
    apiKeys: [],
    paymentMethods: [],
    paymentIntents: [],
    refunds: [],
    events: [],
    endpoints: [],
    deliveries: [],
    idempotency: {},
    session: null,
  };
}

/** Monotonic tie-breaker for ordering and cursors. */
export function nextSeq(db: DemoDb): number {
  db.seq += 1;
  return db.seq;
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Base62 from the Web Crypto CSPRNG, without modulo bias (same as the API). */
export function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < 248) out += ALPHABET[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** `newId('pi')` → `pi_7GxQ2…` (24 base62 chars), the API's public id format. */
export const newId = (prefix: string) => `${prefix}_${randomBase62(24)}`;

export const iso = (ms: number) => new Date(ms).toISOString();

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

/** Salted PBKDF2: even in a demo, never keep plain passwords in localStorage. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 10_000 },
    material,
    256,
  );
  return toHex(bits);
}

/** HMAC-SHA256 in hex with Web Crypto: the same signature the API worker computes. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

/** Newest first, ties broken by insertion order (like `ORDER BY created_at DESC, id DESC`). */
export function newestFirst<T extends { createdAt: string; seq: number }>(a: T, b: T): number {
  return b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq;
}
