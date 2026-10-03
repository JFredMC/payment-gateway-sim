import {
  cvcLength,
  detectBrand,
  isExpired,
  normalizeExpYear,
  normalizePan,
  panProblem,
} from '../domain/cards';
import type { EventType } from '../domain/events';
import { type PsePersonType, pseBankByCode } from '../domain/local-methods';
import {
  canCancel,
  canConfirm,
  canTransition,
  MAX_PAYMENT_ATTEMPTS,
  PAYMENT_METHOD_TYPES,
  type PaymentIntentStatus,
  type PaymentMethodType,
  refundState,
  statusAfterFailure,
} from '../domain/payment-intent-state';
import {
  DECLINES,
  type DeclineCode,
  decodeOutcome,
  encodeOutcome,
  fundingOf,
  simulateCardOutcome,
} from '../domain/test-cards';
import { ALL_EVENTS, listensTo, MAX_WEBHOOK_ATTEMPTS } from '../domain/webhooks';
import {
  DAY_MS,
  type DemoApiKey,
  type DemoDb,
  type DemoEvent,
  type DemoNextAction,
  type DemoPaymentIntent,
  type DemoPaymentMethod,
  type DemoRefund,
  type DemoWebhookDelivery,
  type DemoWebhookEndpoint,
  iso,
  newestFirst,
  newId,
  nextSeq,
  randomBase62,
} from './demo-db';
import { DemoError } from './demo-errors';

/**
 * The gateway's business rules over the demo database: the same state machine,
 * tokenization, refunds, events and webhook outbox as the NestJS services
 * (apps/api/src/modules/payments, events, webhooks), reusing the shared domain.
 * Every function takes the time explicitly so the seed can replay history.
 */

// ------------------------------------------------------------------ serializers

export function paymentMethodJson(pm: DemoPaymentMethod) {
  return {
    id: pm.id,
    object: 'payment_method' as const,
    type: pm.type,
    card: pm.card ? { ...pm.card } : null,
    pse: pm.pse
      ? {
          bank_code: pm.pse.bank_code,
          bank_name: pseBankByCode(pm.pse.bank_code)?.name ?? null,
          person_type: pm.pse.person_type,
        }
      : null,
    nequi: pm.nequi ? { ...pm.nequi } : null,
    billing_details: { name: pm.billingName, email: pm.billingEmail },
    created_at: pm.createdAt,
  };
}

export function paymentIntentJson(db: DemoDb, pi: DemoPaymentIntent) {
  const pm = pi.paymentMethodId ? db.paymentMethods.find((m) => m.id === pi.paymentMethodId) : null;
  return {
    id: pi.id,
    object: 'payment_intent' as const,
    amount: pi.amount,
    amount_received: pi.status === 'succeeded' ? pi.amount : 0,
    amount_refunded: pi.amountRefunded,
    refund_status: refundState(pi.amount, pi.amountRefunded),
    currency: 'COP' as const,
    status: pi.status,
    description: pi.description,
    customer_email: pi.customerEmail,
    metadata: { ...pi.metadata },
    payment_method_types: [...pi.paymentMethodTypes],
    payment_method: pm ? paymentMethodJson(pm) : null,
    client_secret: pi.clientSecret,
    last_payment_error: pi.lastPaymentError ? { ...pi.lastPaymentError } : null,
    next_action: pi.nextAction ? structuredClone(pi.nextAction) : null,
    attempts: pi.attempts,
    return_url: pi.returnUrl,
    cancellation_reason: pi.cancellationReason,
    canceled_at: pi.canceledAt,
    succeeded_at: pi.succeededAt,
    created_at: pi.createdAt,
    livemode: false as const,
  };
}

export function refundJson(refund: DemoRefund) {
  return {
    id: refund.id,
    object: 'refund' as const,
    payment_intent: refund.paymentIntentId,
    amount: refund.amount,
    currency: 'COP' as const,
    reason: refund.reason,
    status: 'succeeded' as const,
    created_at: refund.createdAt,
  };
}

export function eventJson(event: DemoEvent) {
  return {
    id: event.id,
    object: 'event' as const,
    type: event.type,
    created_at: event.createdAt,
    livemode: false as const,
    data: { object: event.data },
  };
}

export function apiKeyJson(key: DemoApiKey, secret?: string) {
  return {
    id: key.id,
    object: 'api_key' as const,
    type: key.type,
    token: key.publishableToken ?? `sk_test_…${key.last4}`,
    ...(secret ? { secret } : {}),
    created_at: key.createdAt,
    last_used_at: key.lastUsedAt,
  };
}

export function endpointJson(endpoint: DemoWebhookEndpoint) {
  return {
    id: endpoint.id,
    object: 'webhook_endpoint' as const,
    url: endpoint.url,
    description: endpoint.description,
    enabled_events: [...endpoint.enabledEvents],
    status: endpoint.status,
    secret: endpoint.secret,
    created_at: endpoint.createdAt,
    updated_at: endpoint.updatedAt,
  };
}

export function deliveryJson(db: DemoDb, delivery: DemoWebhookDelivery, withPayload = false) {
  const endpoint = db.endpoints.find((e) => e.id === delivery.endpointId);
  const event = db.events.find((e) => e.id === delivery.eventId);
  return {
    id: delivery.id,
    object: 'webhook_delivery' as const,
    endpoint: { id: delivery.endpointId, url: endpoint?.url ?? null },
    event: {
      id: delivery.eventId,
      type: delivery.eventType,
      payment_intent: event?.paymentIntentId ?? null,
    },
    status: delivery.status,
    attempts: delivery.attempts,
    max_attempts: MAX_WEBHOOK_ATTEMPTS,
    next_attempt_at: delivery.status === 'pending' ? delivery.nextAttemptAt : null,
    last_attempt_at: delivery.lastAttemptAt,
    response_status: delivery.responseStatus,
    response_body: delivery.responseBody,
    error_code: delivery.errorCode,
    duration_ms: delivery.durationMs,
    attempt_log: delivery.attemptLog.map((a) => ({ ...a })),
    delivered_at: delivery.deliveredAt,
    created_at: delivery.createdAt,
    ...(withPayload && event ? { payload: eventJson(event) } : {}),
  };
}

// --------------------------------------------------------------------- merchants

export function issueApiKey(
  db: DemoDb,
  merchantId: string,
  type: DemoApiKey['type'],
  at: number,
): { key: DemoApiKey; token: string } {
  const token = `${type === 'publishable' ? 'pk' : 'sk'}_test_${randomBase62(32)}`;
  const key: DemoApiKey = {
    id: newId('key'),
    merchantId,
    type,
    publishableToken: type === 'publishable' ? token : null,
    last4: token.slice(-4),
    createdAt: iso(at),
    lastUsedAt: null,
    revokedAt: null,
  };
  db.apiKeys.push(key);
  return { key, token };
}

export function activeKeys(db: DemoDb, merchantId: string): DemoApiKey[] {
  return db.apiKeys
    .filter((k) => k.merchantId === merchantId && !k.revokedAt)
    .sort((a, b) => a.type.localeCompare(b.type));
}

export function publishableKeyOf(db: DemoDb, merchantId: string): string | null {
  return activeKeys(db, merchantId).find((k) => k.type === 'publishable')?.publishableToken ?? null;
}

// ------------------------------------------------------------------------ events

/** Records an event and, in the same "transaction", enqueues its webhook deliveries (outbox). */
export function recordEvent(
  db: DemoDb,
  merchantId: string,
  type: EventType,
  paymentIntentId: string | null,
  data: Record<string, unknown>,
  at: number,
): DemoEvent {
  const event: DemoEvent = {
    id: newId('evt'),
    seq: nextSeq(db),
    merchantId,
    type,
    paymentIntentId,
    data,
    createdAt: iso(at),
  };
  db.events.push(event);
  for (const endpoint of db.endpoints) {
    if (
      endpoint.merchantId === merchantId &&
      endpoint.status === 'enabled' &&
      listensTo(endpoint.enabledEvents, type)
    ) {
      db.deliveries.push({
        id: newId('whdel'),
        seq: nextSeq(db),
        merchantId,
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: type,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: iso(at),
        lastAttemptAt: null,
        responseStatus: null,
        responseBody: null,
        errorCode: null,
        durationMs: null,
        attemptLog: [],
        deliveredAt: null,
        createdAt: iso(at),
      });
    }
  }
  return event;
}

// ---------------------------------------------------------------- payment intents

export interface CreateIntentInput {
  amount: number;
  description?: string | null;
  customerEmail?: string | null;
  metadata?: Record<string, string>;
  paymentMethodTypes?: PaymentMethodType[];
  returnUrl?: string | null;
}

export function createIntent(
  db: DemoDb,
  merchantId: string,
  input: CreateIntentInput,
  at: number,
): DemoPaymentIntent {
  const id = newId('pi');
  const pi: DemoPaymentIntent = {
    id,
    seq: nextSeq(db),
    merchantId,
    amount: input.amount,
    amountRefunded: 0,
    status: 'requires_payment_method',
    description: input.description || null,
    customerEmail: input.customerEmail ?? null,
    metadata: input.metadata ?? {},
    paymentMethodTypes: input.paymentMethodTypes ?? [...PAYMENT_METHOD_TYPES],
    paymentMethodId: null,
    clientSecret: `${id}_secret_${randomBase62(24)}`,
    lastPaymentError: null,
    nextAction: null,
    attempts: 0,
    returnUrl: input.returnUrl ?? null,
    cancellationReason: null,
    canceledAt: null,
    succeededAt: null,
    createdAt: iso(at),
  };
  db.paymentIntents.push(pi);
  emit(db, pi, 'payment_intent.created', at);
  return pi;
}

export function findIntent(db: DemoDb, merchantId: string, id: string): DemoPaymentIntent {
  const pi = db.paymentIntents.find((p) => p.id === id && p.merchantId === merchantId);
  if (!pi) throw new DemoError('NOT_FOUND', `No such payment_intent: ${id}`);
  return pi;
}

export function findByClientSecret(db: DemoDb, id: string, secret: string): DemoPaymentIntent {
  const pi = db.paymentIntents.find((p) => p.id === id);
  if (!pi || pi.clientSecret !== secret) {
    throw new DemoError('INVALID_CLIENT_SECRET', 'No such payment for this client secret.');
  }
  return pi;
}

export function listIntents(db: DemoDb, merchantId: string, status?: PaymentIntentStatus) {
  return db.paymentIntents
    .filter((p) => p.merchantId === merchantId && (!status || p.status === status))
    .sort(newestFirst);
}

export function confirmIntent(
  db: DemoDb,
  pi: DemoPaymentIntent,
  paymentMethodId: string,
  at: number,
): DemoPaymentIntent {
  if (!canConfirm(pi.status)) throw unexpectedState(pi, 'confirm');
  const pm = db.paymentMethods.find(
    (m) => m.id === paymentMethodId && m.merchantId === pi.merchantId,
  );
  if (!pm) {
    throw new DemoError('INVALID_PAYMENT_METHOD', `No such payment method: ${paymentMethodId}`, {
      param: 'payment_method',
    });
  }
  if (!pi.paymentMethodTypes.includes(pm.type)) {
    throw new DemoError(
      'PAYMENT_METHOD_NOT_ALLOWED',
      `This payment does not accept ${pm.type} (allowed: ${pi.paymentMethodTypes.join(', ')}).`,
    );
  }
  pi.attempts += 1;
  pi.paymentMethodId = pm.id;
  pi.lastPaymentError = null;
  pi.nextAction = null;
  move(db, pi, 'processing', 'payment_intent.processing', at);

  const outcome = decodeOutcome(pm.outcome);
  if (outcome.kind === 'succeed') {
    succeed(db, pi, at);
  } else if (outcome.kind === 'decline') {
    fail(db, pi, pm, outcome.declineCode, at);
  } else {
    pi.nextAction = nextActionFor(pm);
    move(db, pi, 'requires_action', 'payment_intent.requires_action', at);
  }
  return pi;
}

/** Result of the simulated 3DS challenge, PSE bank page or Nequi push. */
export function authenticateIntent(
  db: DemoDb,
  pi: DemoPaymentIntent,
  result: 'approve' | 'reject',
  at: number,
): DemoPaymentIntent {
  if (pi.status !== 'requires_action') throw unexpectedState(pi, 'authenticate');
  const pm = db.paymentMethods.find((m) => m.id === pi.paymentMethodId);
  pi.nextAction = null;
  if (result === 'approve') {
    move(db, pi, 'processing', 'payment_intent.processing', at);
    succeed(db, pi, at);
  } else {
    fail(db, pi, pm, pm?.type === 'card' ? 'authentication_failed' : 'payment_rejected', at);
  }
  return pi;
}

export function cancelIntent(
  db: DemoDb,
  pi: DemoPaymentIntent,
  reason: string | null,
  at: number,
): DemoPaymentIntent {
  if (!canCancel(pi.status)) throw unexpectedState(pi, 'cancel');
  pi.nextAction = null;
  pi.canceledAt = iso(at);
  pi.cancellationReason = reason;
  move(db, pi, 'canceled', 'payment_intent.canceled', at);
  return pi;
}

export function refundIntent(
  db: DemoDb,
  pi: DemoPaymentIntent,
  input: { amount?: number; reason?: string | null },
  at: number,
): DemoRefund {
  if (pi.status !== 'succeeded') {
    throw new DemoError(
      'PAYMENT_INTENT_UNEXPECTED_STATE',
      `Only succeeded payments can be refunded (status: ${pi.status}).`,
      { status_current: pi.status },
    );
  }
  const refundable = pi.amount - pi.amountRefunded;
  const amount = input.amount ?? refundable;
  if (refundable === 0 || amount > refundable) {
    throw new DemoError(
      'REFUND_EXCEEDS_AMOUNT',
      `The refund amount exceeds what is left to refund (${refundable}).`,
      { refundable_amount: refundable },
    );
  }
  const refund: DemoRefund = {
    id: newId('re'),
    merchantId: pi.merchantId,
    paymentIntentId: pi.id,
    amount,
    reason: input.reason ?? null,
    createdAt: iso(at),
  };
  db.refunds.push(refund);
  pi.amountRefunded += amount;
  recordEvent(
    db,
    pi.merchantId,
    'refund.created',
    pi.id,
    { ...refundJson(refund), payment_intent_object: paymentIntentJson(db, pi) },
    at,
  );
  return refund;
}

function succeed(db: DemoDb, pi: DemoPaymentIntent, at: number) {
  pi.succeededAt = iso(at);
  move(db, pi, 'succeeded', 'payment_intent.succeeded', at);
}

function fail(
  db: DemoDb,
  pi: DemoPaymentIntent,
  pm: DemoPaymentMethod | null | undefined,
  code: DeclineCode,
  at: number,
) {
  const info = DECLINES[code];
  pi.lastPaymentError = {
    type: pm?.type === 'card' ? 'card_error' : 'payment_method_error',
    code: info.errorCode,
    decline_code: code,
    message: info.message,
    payment_method_type: pm?.type ?? 'card',
  };
  move(db, pi, statusAfterFailure(pi.attempts), 'payment_intent.payment_failed', at);
}

/** The only place where `status` changes: guarded by the shared state machine. */
function move(
  db: DemoDb,
  pi: DemoPaymentIntent,
  to: PaymentIntentStatus,
  event: EventType,
  at: number,
) {
  if (!canTransition(pi.status, to)) {
    throw new Error(`Illegal payment intent transition ${pi.status} -> ${to} (${pi.id})`);
  }
  pi.status = to;
  emit(db, pi, event, at);
}

function emit(db: DemoDb, pi: DemoPaymentIntent, type: EventType, at: number) {
  recordEvent(db, pi.merchantId, type, pi.id, paymentIntentJson(db, pi), at);
}

function nextActionFor(pm: DemoPaymentMethod): DemoNextAction {
  switch (pm.type) {
    case 'card':
      return {
        type: 'three_d_secure',
        three_d_secure: { brand: pm.card?.brand ?? 'card', last4: pm.card?.last4 ?? '' },
      };
    case 'pse':
      return {
        type: 'pse_redirect',
        pse_redirect: {
          bank_code: pm.pse?.bank_code ?? '',
          bank_name: pseBankByCode(pm.pse?.bank_code ?? '')?.name ?? 'Banco',
        },
      };
    case 'nequi':
      return {
        type: 'nequi_push',
        nequi_push: { phone: `••• ••• ${pm.nequi?.phone_last4 ?? ''}` },
      };
  }
}

function unexpectedState(pi: DemoPaymentIntent, action: string) {
  return new DemoError(
    'PAYMENT_INTENT_UNEXPECTED_STATE',
    `You cannot ${action} this payment intent because it has a status of ${pi.status}.`,
    { status_current: pi.status },
  );
}

// ------------------------------------------------------------------- tokenization

export type PaymentMethodInput =
  | {
      type: 'card';
      card: { number: string; exp_month: number; exp_year: number; cvc: string };
      billing?: { name?: string | null; email?: string | null };
    }
  | {
      type: 'pse';
      pse: { bank: string; person_type?: PsePersonType };
      billing?: { name?: string | null; email?: string | null };
    }
  | {
      type: 'nequi';
      nequi: { phone: string };
      billing?: { name?: string | null; email?: string | null };
    };

const PAN_MESSAGES = {
  incomplete: 'Your card number is incomplete.',
  unknown_brand: 'Your card brand is not supported.',
  invalid_length: 'Your card number has an invalid length.',
  invalid_checksum: 'Your card number is invalid.',
} as const;

/**
 * Turns raw payment details into a `pm_` id. The card number only lives in this
 * function's scope: brand, last 4 and the simulated outcome are kept; the PAN
 * and CVC are dropped (never written to localStorage).
 */
export function tokenize(
  db: DemoDb,
  merchantId: string,
  input: PaymentMethodInput,
  at: number,
): DemoPaymentMethod {
  const base = {
    id: newId('pm'),
    merchantId,
    type: input.type,
    card: null,
    pse: null,
    nequi: null,
    billingName: input.billing?.name?.trim() || null,
    billingEmail: input.billing?.email ?? null,
    createdAt: iso(at),
  };
  let pm: DemoPaymentMethod;
  switch (input.type) {
    case 'card': {
      const pan = normalizePan(input.card.number);
      const problem = panProblem(pan);
      if (problem) {
        throw new DemoError('INVALID_CARD', PAN_MESSAGES[problem], {
          param: 'card[number]',
          reason: problem,
        });
      }
      const brand = detectBrand(pan)!;
      const expYear = normalizeExpYear(input.card.exp_year);
      if (isExpired(input.card.exp_month, expYear, new Date(at))) {
        throw new DemoError('INVALID_CARD', "Your card's expiration date is in the past.", {
          param: 'card[exp_year]',
          reason: 'invalid_expiry',
        });
      }
      if (input.card.cvc.length !== cvcLength(brand)) {
        throw new DemoError('INVALID_CARD', "Your card's security code is invalid.", {
          param: 'card[cvc]',
          reason: 'invalid_cvc',
        });
      }
      pm = {
        ...base,
        card: {
          brand,
          last4: pan.slice(-4),
          exp_month: input.card.exp_month,
          exp_year: expYear,
          funding: fundingOf(pan),
        },
        outcome: encodeOutcome(simulateCardOutcome(pan)),
      };
      break;
    }
    case 'pse': {
      const bank = pseBankByCode(input.pse.bank);
      if (!bank) {
        throw new DemoError('INVALID_PAYMENT_METHOD', 'Unknown PSE bank.', { param: 'pse[bank]' });
      }
      pm = {
        ...base,
        pse: { bank_code: bank.code, person_type: input.pse.person_type ?? 'natural' },
        outcome: encodeOutcome({ kind: 'challenge' }),
      };
      break;
    }
    case 'nequi':
      pm = {
        ...base,
        nequi: { phone_last4: input.nequi.phone.slice(-4) },
        outcome: encodeOutcome({ kind: 'challenge' }),
      };
      break;
  }
  db.paymentMethods.push(pm);
  return pm;
}

// ------------------------------------------------------------------------ checkout

export function checkoutView(db: DemoDb, pi: DemoPaymentIntent) {
  const json = paymentIntentJson(db, pi);
  const merchant = db.merchants.find((m) => m.id === pi.merchantId);
  return {
    object: 'checkout' as const,
    id: json.id,
    amount: json.amount,
    amount_refunded: json.amount_refunded,
    currency: json.currency,
    description: json.description,
    status: json.status,
    merchant: { business_name: merchant?.businessName ?? '' },
    publishable_key: publishableKeyOf(db, pi.merchantId),
    payment_method_types: json.payment_method_types,
    payment_method: json.payment_method,
    next_action: json.next_action,
    last_payment_error: json.last_payment_error,
    attempts: json.attempts,
    max_attempts: MAX_PAYMENT_ATTEMPTS,
    return_url: json.return_url,
    created_at: json.created_at,
  };
}

// ----------------------------------------------------------------------- webhooks

export function normalizeEvents(events: string[]): string[] {
  return events.includes(ALL_EVENTS) ? [ALL_EVENTS] : [...events].sort();
}

// ------------------------------------------------------------------------ summary

export const DASHBOARD_TIME_ZONE = 'America/Bogota';
/** Colombia is UTC-5 all year (no daylight saving time). */
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of the Bogotá calendar day of an instant. */
export function bogotaDay(ms: number): string {
  return new Date(ms + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Same figures as DashboardService.summary (SQL), computed over the demo rows. */
export function summary(db: DemoDb, merchantId: string, days: number, now: number) {
  const today = Date.parse(`${bogotaDay(now)}T00:00:00.000Z`);
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(today - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10),
  );
  const periodStart = today - (days - 1) * DAY_MS - BOGOTA_OFFSET_MS; // local midnight, as UTC ms
  const succeeded = db.paymentIntents.filter(
    (p) =>
      p.merchantId === merchantId &&
      p.status === 'succeeded' &&
      p.succeededAt !== null &&
      Date.parse(p.succeededAt) >= periodStart,
  );
  const daily = dates.map((date) => {
    const ofDay = succeeded.filter((p) => bogotaDay(Date.parse(p.succeededAt!)) === date);
    return { date, volume: ofDay.reduce((s, p) => s + p.amount, 0), count: ofDay.length };
  });
  const gross = daily.reduce((s, d) => s + d.volume, 0);
  const count = daily.reduce((s, d) => s + d.count, 0);
  const refunded = db.refunds
    .filter((r) => r.merchantId === merchantId && Date.parse(r.createdAt) >= periodStart)
    .reduce((s, r) => s + r.amount, 0);
  const inPeriod = db.events.filter(
    (e) => e.merchantId === merchantId && Date.parse(e.createdAt) >= periodStart,
  );
  const succeededEvents = inPeriod.filter((e) => e.type === 'payment_intent.succeeded').length;
  const failedEvents = inPeriod.filter((e) => e.type === 'payment_intent.payment_failed').length;
  const attempts = succeededEvents + failedEvents;
  const byMethod = new Map<PaymentMethodType, { count: number; volume: number }>();
  for (const pi of succeeded) {
    const type = db.paymentMethods.find((m) => m.id === pi.paymentMethodId)?.type;
    if (!type) continue;
    const entry = byMethod.get(type) ?? { count: 0, volume: 0 };
    entry.count += 1;
    entry.volume += pi.amount;
    byMethod.set(type, entry);
  }
  return {
    object: 'dashboard_summary' as const,
    currency: 'COP' as const,
    period: { days, from: dates[0], to: dates.at(-1), time_zone: DASHBOARD_TIME_ZONE },
    gross_volume: gross,
    refunded_amount: refunded,
    net_volume: gross - refunded,
    succeeded_count: count,
    average_ticket: count > 0 ? Math.round(gross / count / 100) * 100 : 0,
    approval_rate: attempts > 0 ? Math.round((succeededEvents / attempts) * 1000) / 1000 : null,
    failed_attempts: failedEvents,
    pending_count: db.paymentIntents.filter(
      (p) =>
        p.merchantId === merchantId &&
        (p.status === 'requires_payment_method' || p.status === 'requires_action'),
    ).length,
    by_method: [...byMethod.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.volume - a.volume),
    daily,
  };
}
