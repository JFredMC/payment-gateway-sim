import { inject, Injectable, InjectionToken } from '@angular/core';
import type { DemoMode } from '../core/demo/demo-mode';
import { EVENT_TYPES } from '../domain/events';
import { PSE_PERSON_TYPES } from '../domain/local-methods';
import {
  MAX_AMOUNT,
  MIN_AMOUNT,
  PAYMENT_INTENT_STATUSES,
  PAYMENT_METHOD_TYPES,
  type PaymentIntentStatus,
  type PaymentMethodType,
} from '../domain/payment-intent-state';
import {
  ALL_EVENTS,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_ENDPOINT_STATUSES,
  type WebhookDeliveryStatus,
  type WebhookEndpointStatus,
  webhookUrlProblem,
} from '../domain/webhooks';
import {
  DEMO_DB_VERSION,
  DEMO_LIMITS,
  type DemoDb,
  type DemoUser,
  hashPassword,
  iso,
  newestFirst,
  newId,
  randomBase62,
} from './demo-db';
import {
  activeKeys,
  apiKeyJson,
  authenticateIntent,
  cancelIntent,
  checkoutView,
  confirmIntent,
  createIntent,
  deliveryJson,
  endpointJson,
  eventJson,
  findByClientSecret,
  findIntent,
  issueApiKey,
  listIntents,
  normalizeEvents,
  type PaymentMethodInput,
  paymentIntentJson,
  paymentMethodJson,
  refundIntent,
  refundJson,
  summary,
  tokenize,
} from './demo-engine';
import { DemoError, validationError } from './demo-errors';
import { createSeedDb, DEMO_CREDENTIALS } from './demo-seed';
import { attemptDelivery, dispatchDue } from './demo-webhooks';

export const DEMO_STORAGE_KEY = 'pasarela-demo:db';

/** Where the demo data lives (localStorage in the browser, swappable in tests). */
export const DEMO_STORAGE = new InjectionToken<Storage>('DEMO_STORAGE', {
  providedIn: 'root',
  factory: () => localStorage,
});

/** Current time in ms (injectable so tests can move the clock). */
export const DEMO_CLOCK = new InjectionToken<() => number>('DEMO_CLOCK', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

export interface DemoRequest {
  method: string;
  /** Path after /api/v1, e.g. "/dashboard/payment-intents". */
  path: string;
  query: Record<string, string>;
  header: (name: string) => string | null;
  body: unknown;
}

export interface DemoResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

interface Ctx {
  db: DemoDb;
  req: DemoRequest;
  now: number;
  params: string[];
}

type Handler = (ctx: Ctx) => DemoResponse | Promise<DemoResponse>;
type Json = Record<string, unknown>;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,255}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID = (prefix: string) => `(${prefix}_[0-9A-Za-z]{24})`;
const DEFAULT_PAGE_SIZE = 20;

const ok = (body: unknown, status = 200): DemoResponse => ({ status, body });

/**
 * In-browser implementation of the REST API used by the web app, for the
 * GitHub Pages demo. Same routes, JSON shapes, status codes and error codes
 * (problem+json), Idempotency-Key semantics and cursor pagination as the
 * NestJS API, with the business rules of the shared domain (demo-engine.ts).
 * Each request works on a fresh copy of the database and writes it back only
 * if it succeeds, so a failed request never leaves partial changes.
 */
@Injectable({ providedIn: 'root' })
export class DemoBackend implements DemoMode {
  private readonly storage = inject(DEMO_STORAGE);
  private readonly clock = inject(DEMO_CLOCK);

  readonly credentials = DEMO_CREDENTIALS;

  private readonly routes: [method: string, pattern: RegExp, handler: Handler][] = [
    ['GET', /^\/health$/, () => ok({ status: 'ok', info: { demo: { status: 'up' } } })],
    ['POST', /^\/auth\/register$/, (c) => this.register(c)],
    ['POST', /^\/auth\/login$/, (c) => this.login(c)],
    ['POST', /^\/auth\/refresh$/, (c) => this.refresh(c)],
    ['POST', /^\/auth\/logout$/, (c) => this.logout(c)],
    ['GET', /^\/auth\/me$/, (c) => ok(this.publicUser(c.db, this.authenticate(c)))],
    // Dashboard
    ['GET', /^\/dashboard\/summary$/, (c) => this.summary(c)],
    ['GET', /^\/dashboard\/payment-intents$/, (c) => this.listPayments(c)],
    ['POST', /^\/dashboard\/payment-intents$/, (c) => this.createPayment(c)],
    ['GET', new RegExp(`^/dashboard/payment-intents/${ID('pi')}$`), (c) => this.paymentDetail(c)],
    ['POST', new RegExp(`^/dashboard/payment-intents/${ID('pi')}/cancel$`), (c) => this.cancel(c)],
    ['POST', new RegExp(`^/dashboard/payment-intents/${ID('pi')}/refunds$`), (c) => this.refund(c)],
    ['GET', /^\/dashboard\/api-keys$/, (c) => this.listKeys(c)],
    ['POST', /^\/dashboard\/api-keys\/roll$/, (c) => this.rollKey(c)],
    ['GET', /^\/dashboard\/webhook-endpoints$/, (c) => this.listEndpoints(c)],
    ['POST', /^\/dashboard\/webhook-endpoints$/, (c) => this.createEndpoint(c)],
    [
      'GET',
      new RegExp(`^/dashboard/webhook-endpoints/${ID('we')}$`),
      (c) => ok(endpointJson(this.endpoint(c))),
    ],
    [
      'PATCH',
      new RegExp(`^/dashboard/webhook-endpoints/${ID('we')}$`),
      (c) => this.updateEndpoint(c),
    ],
    [
      'DELETE',
      new RegExp(`^/dashboard/webhook-endpoints/${ID('we')}$`),
      (c) => this.deleteEndpoint(c),
    ],
    [
      'POST',
      new RegExp(`^/dashboard/webhook-endpoints/${ID('we')}/roll-secret$`),
      (c) => this.rollSecret(c),
    ],
    ['GET', /^\/dashboard\/webhook-deliveries$/, (c) => this.listDeliveries(c)],
    [
      'GET',
      new RegExp(`^/dashboard/webhook-deliveries/${ID('whdel')}$`),
      (c) => ok(deliveryJson(c.db, this.delivery(c), true)),
    ],
    [
      'POST',
      new RegExp(`^/dashboard/webhook-deliveries/${ID('whdel')}/retry$`),
      (c) => this.retryDelivery(c),
    ],
    // Hosted checkout (client secret / publishable key)
    ['POST', /^\/payment_methods$/, (c) => this.createPaymentMethod(c)],
    ['GET', new RegExp(`^/checkout/${ID('pi')}$`), (c) => this.checkout(c)],
    ['POST', new RegExp(`^/checkout/${ID('pi')}/confirm$`), (c) => this.confirm(c)],
    [
      'POST',
      new RegExp(`^/checkout/${ID('pi')}/authenticate$`),
      (c) => this.authenticateCheckout(c),
    ],
  ];

  async handle(req: DemoRequest): Promise<DemoResponse> {
    const instance = `/api/v1${req.path}`;
    try {
      const route = this.routes.find(([method, pattern]) => {
        return method === req.method && pattern.test(req.path);
      });
      if (!route) throw new DemoError('NOT_FOUND', `Cannot ${req.method} ${instance}`);
      const [, pattern, handler] = route;
      const db = await this.load();
      const now = this.clock();
      // The webhook "worker" runs before and after each request.
      let changed = (await dispatchDue(db, now)) > 0;
      const params = (pattern.exec(req.path) ?? []).slice(1);
      const ctx: Ctx = { db, req, now, params };
      const response = await handler(ctx);
      changed = (await dispatchDue(ctx.db, now)) > 0 || changed;
      if (req.method !== 'GET' || changed) this.save(ctx.db);
      return response;
    } catch (error) {
      const problem =
        error instanceof DemoError
          ? error
          : new DemoError('INTERNAL_ERROR', 'An unexpected error occurred.');
      if (!(error instanceof DemoError)) console.error('[demo backend]', error);
      return {
        status: problem.status,
        body: problem.toProblem(instance),
        headers: { 'Content-Type': 'application/problem+json' },
      };
    }
  }

  async reset(): Promise<void> {
    this.save(await createSeedDb(this.clock()));
  }

  // ---------------------------------------------------------------- storage

  private loadStored(): DemoDb | null {
    try {
      const raw = this.storage.getItem(DEMO_STORAGE_KEY);
      const db = raw ? (JSON.parse(raw) as DemoDb) : null;
      return db?.version === DEMO_DB_VERSION ? db : null;
    } catch {
      return null; // corrupted data: start over with the sample data
    }
  }

  private async load(): Promise<DemoDb> {
    const stored = this.loadStored();
    if (stored) return stored;
    const seeded = await createSeedDb(this.clock());
    this.save(seeded);
    return seeded;
  }

  private save(db: DemoDb): void {
    const now = this.clock();
    for (const [key, record] of Object.entries(db.idempotency)) {
      if (record.expiresAt <= now) delete db.idempotency[key];
    }
    this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
  }

  // ------------------------------------------------------------------- auth

  private async register(c: Ctx): Promise<DemoResponse> {
    const body = objectBody(c.req.body, ['email', 'password', 'full_name', 'business_name']);
    const email = str(body['email']).trim().toLowerCase();
    const password = str(body['password']);
    const fullName = str(body['full_name']).trim();
    const businessName = str(body['business_name']).trim();
    const errors: string[] = [];
    if (!EMAIL_PATTERN.test(email) || email.length > 254) errors.push('email must be an email');
    if (password.length < 8 || password.length > 128) {
      errors.push('password must be longer than or equal to 8 characters');
    }
    if (!/[A-Za-z]/.test(password)) errors.push('password must contain at least one letter');
    if (!/\d/.test(password)) errors.push('password must contain at least one number');
    if (fullName.length < 2 || fullName.length > 120) {
      errors.push('full_name must be longer than or equal to 2 characters');
    }
    if (businessName.length < 2 || businessName.length > 120) {
      errors.push('business_name must be longer than or equal to 2 characters');
    }
    if (errors.length) throw validationError(errors);
    if (c.db.users.some((u) => u.email === email)) {
      throw new DemoError('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
    }
    const salt = newId('salt');
    const passwordHash = await hashPassword(password, salt);
    // Re-read after the async hash so a concurrent tab's writes are not lost.
    c.db = this.loadStored() ?? c.db;
    if (c.db.users.some((u) => u.email === email)) {
      throw new DemoError('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
    }
    const merchantId = newId('acct');
    const createdAt = iso(c.now);
    c.db.merchants.push({ id: merchantId, businessName, createdAt });
    const user: DemoUser = {
      id: crypto.randomUUID(),
      email,
      fullName,
      role: 'OWNER',
      merchantId,
      salt,
      passwordHash,
      createdAt,
    };
    c.db.users.push(user);
    issueApiKey(c.db, merchantId, 'publishable', c.now);
    issueApiKey(c.db, merchantId, 'secret', c.now);
    return ok(this.startSession(c, user), 201);
  }

  private async login(c: Ctx): Promise<DemoResponse> {
    const body = objectBody(c.req.body, ['email', 'password']);
    const email = str(body['email']).trim().toLowerCase();
    const password = str(body['password']);
    const user = c.db.users.find((u) => u.email === email);
    // Hash even for unknown emails, like the API (no user enumeration by timing).
    const hash = await hashPassword(password, user?.salt ?? 'unknown-user');
    if (!user || hash !== user.passwordHash) {
      throw new DemoError('INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    c.db = this.loadStored() ?? c.db;
    return ok(this.startSession(c, user));
  }

  /** The "refresh cookie" is the session stored with the demo data. */
  private refresh(c: Ctx): DemoResponse {
    const session = c.db.session;
    const user = session && c.db.users.find((u) => u.id === session.userId);
    if (!session || !user || session.expiresAt <= c.now) {
      c.db.session = null;
      throw new DemoError('INVALID_REFRESH_TOKEN', 'No active session.');
    }
    return ok(this.authResponse(c, user, session.sid));
  }

  private logout(c: Ctx): DemoResponse {
    c.db.session = null;
    return { status: 204, body: null };
  }

  private startSession(c: Ctx, user: DemoUser) {
    const sid = crypto.randomUUID();
    c.db.session = { sid, userId: user.id, expiresAt: c.now + DEMO_LIMITS.sessionTtlMs };
    return this.authResponse(c, user, sid);
  }

  private authResponse(c: Ctx, user: DemoUser, sid: string) {
    const exp = c.now + DEMO_LIMITS.accessTokenTtlSeconds * 1000;
    return {
      access_token: `demo.${btoa(JSON.stringify({ sub: user.id, sid, exp }))}`,
      token_type: 'Bearer',
      expires_in: DEMO_LIMITS.accessTokenTtlSeconds,
      user: this.publicUser(c.db, user),
    };
  }

  private publicUser(db: DemoDb, user: DemoUser) {
    const merchant = db.merchants.find((m) => m.id === user.merchantId);
    return {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      merchant: { id: user.merchantId, business_name: merchant?.businessName ?? '' },
      created_at: user.createdAt,
    };
  }

  /** Validates the bearer token (not expired, current session) and returns the merchant id. */
  private authenticate(c: Ctx): DemoUser {
    const header = c.req.header('Authorization') ?? '';
    const match = /^Bearer demo\.(.+)$/.exec(header);
    let claims: { sub?: string; sid?: string; exp?: number } = {};
    try {
      claims = match ? JSON.parse(atob(match[1])) : {};
    } catch {
      claims = {};
    }
    const session = c.db.session;
    const user = c.db.users.find((u) => u.id === claims.sub);
    if (
      !user ||
      !session ||
      claims.sid !== session.sid ||
      typeof claims.exp !== 'number' ||
      claims.exp <= c.now
    ) {
      throw new DemoError('UNAUTHORIZED', 'Missing or invalid access token.');
    }
    return user;
  }

  private merchantId(c: Ctx): string {
    return this.authenticate(c).merchantId;
  }

  // ------------------------------------------------------------- idempotency

  /** Runs `execute` once per (merchant, scope, key); replays the stored response. */
  private async idempotent(
    c: Ctx,
    merchantId: string,
    scope: string,
    payload: unknown,
    execute: () => DemoResponse,
  ): Promise<DemoResponse> {
    const key = c.req.header('Idempotency-Key');
    if (!key) {
      throw new DemoError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'This endpoint requires an Idempotency-Key header.',
      );
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new DemoError(
        'IDEMPOTENCY_KEY_INVALID',
        'Idempotency-Key must be 8-255 URL-safe characters.',
      );
    }
    const id = `${merchantId}|${scope}|${key}`;
    const fingerprint = stableJson(payload);
    const stored = c.db.idempotency[id];
    if (stored && stored.expiresAt > c.now) {
      if (stored.fingerprint !== fingerprint) {
        throw new DemoError(
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used with a different request.',
        );
      }
      return {
        status: stored.status,
        body: structuredClone(stored.body),
        headers: { 'Idempotent-Replayed': 'true' },
      };
    }
    const response = execute();
    c.db.idempotency[id] = {
      fingerprint,
      status: response.status,
      body: structuredClone(response.body),
      expiresAt: c.now + DEMO_LIMITS.idempotencyTtlMs,
    };
    return response;
  }

  // --------------------------------------------------------------- dashboard

  private summary(c: Ctx): DemoResponse {
    const merchantId = this.merchantId(c);
    const days = c.req.query['days'] ?? '7';
    if (days !== '7' && days !== '30') throw validationError(['days must be one of: 7, 30']);
    return ok(summary(c.db, merchantId, Number(days), c.now));
  }

  private listPayments(c: Ctx): DemoResponse {
    const merchantId = this.merchantId(c);
    const status = c.req.query['status'] as PaymentIntentStatus | undefined;
    if (status && !PAYMENT_INTENT_STATUSES.includes(status)) {
      throw validationError([`status must be one of: ${PAYMENT_INTENT_STATUSES.join(', ')}`]);
    }
    return ok(
      paginate(c, listIntents(c.db, merchantId, status), (pi) => paymentIntentJson(c.db, pi)),
    );
  }

  private createPayment(c: Ctx): Promise<DemoResponse> {
    const merchantId = this.merchantId(c);
    const body = objectBody(c.req.body, [
      'amount',
      'currency',
      'description',
      'customer_email',
      'metadata',
      'payment_method_types',
      'return_url',
    ]);
    const errors: string[] = [];
    const amount = body['amount'];
    if (
      !Number.isInteger(amount) ||
      (amount as number) < MIN_AMOUNT ||
      (amount as number) > MAX_AMOUNT
    ) {
      errors.push(`amount must be an integer between ${MIN_AMOUNT} and ${MAX_AMOUNT}`);
    }
    if (body['currency'] !== undefined && body['currency'] !== 'COP') {
      errors.push('currency must be one of the following values: COP');
    }
    const description = body['description'];
    if (
      description !== undefined &&
      (typeof description !== 'string' || description.length > 255)
    ) {
      errors.push('description must be shorter than or equal to 255 characters');
    }
    const email = body['customer_email'];
    if (email !== undefined && (typeof email !== 'string' || !EMAIL_PATTERN.test(email))) {
      errors.push('customer_email must be an email');
    }
    const types = body['payment_method_types'];
    if (
      types !== undefined &&
      (!Array.isArray(types) ||
        types.length === 0 ||
        new Set(types).size !== types.length ||
        types.some((t) => !PAYMENT_METHOD_TYPES.includes(t as PaymentMethodType)))
    ) {
      errors.push('payment_method_types must be a non-empty list of card, pse, nequi');
    }
    const returnUrl = body['return_url'];
    if (
      returnUrl !== undefined &&
      (typeof returnUrl !== 'string' || !/^https?:\/\/\S+$/.test(returnUrl))
    ) {
      errors.push('return_url must be a URL address');
    }
    if (errors.length) throw validationError(errors);
    return this.idempotent(c, merchantId, 'POST /dashboard/payment-intents', body, () => {
      const pi = createIntent(
        c.db,
        merchantId,
        {
          amount: amount as number,
          description: (description as string | undefined) ?? null,
          customerEmail: (email as string | undefined) ?? null,
          metadata: (body['metadata'] as Record<string, string> | undefined) ?? {},
          paymentMethodTypes: types as PaymentMethodType[] | undefined,
          returnUrl: (returnUrl as string | undefined) ?? null,
        },
        c.now,
      );
      return ok(paymentIntentJson(c.db, pi), 201);
    });
  }

  private paymentDetail(c: Ctx): DemoResponse {
    const merchantId = this.merchantId(c);
    const pi = findIntent(c.db, merchantId, c.params[0]);
    const events = c.db.events
      .filter((e) => e.merchantId === merchantId && e.paymentIntentId === pi.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.seq - b.seq);
    const eventIds = new Set(events.map((e) => e.id));
    return ok({
      object: 'payment_intent_detail',
      payment_intent: paymentIntentJson(c.db, pi),
      refunds: c.db.refunds
        .filter((r) => r.paymentIntentId === pi.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(refundJson),
      timeline: events.map(eventJson),
      webhook_deliveries: c.db.deliveries
        .filter((d) => eventIds.has(d.eventId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.seq - b.seq)
        .map((d) => deliveryJson(c.db, d)),
    });
  }

  private cancel(c: Ctx): DemoResponse {
    const merchantId = this.merchantId(c);
    const body = objectBody(c.req.body ?? {}, ['cancellation_reason']);
    const reason = body['cancellation_reason'];
    const reasons = ['duplicate', 'fraudulent', 'requested_by_customer', 'abandoned'];
    if (reason !== undefined && !reasons.includes(reason as string)) {
      throw validationError([`cancellation_reason must be one of: ${reasons.join(', ')}`]);
    }
    const pi = findIntent(c.db, merchantId, c.params[0]);
    cancelIntent(c.db, pi, (reason as string | undefined) ?? null, c.now);
    return ok(paymentIntentJson(c.db, pi));
  }

  private refund(c: Ctx): Promise<DemoResponse> {
    const merchantId = this.merchantId(c);
    const body = objectBody(c.req.body ?? {}, ['amount', 'reason']);
    const errors: string[] = [];
    const amount = body['amount'];
    if (amount !== undefined && (!Number.isInteger(amount) || (amount as number) < 1)) {
      errors.push('amount must be a positive integer');
    }
    const reason = body['reason'];
    const reasons = ['duplicate', 'fraudulent', 'requested_by_customer'];
    if (reason !== undefined && !reasons.includes(reason as string)) {
      errors.push(`reason must be one of: ${reasons.join(', ')}`);
    }
    if (errors.length) throw validationError(errors);
    const id = c.params[0];
    return this.idempotent(
      c,
      merchantId,
      `POST /dashboard/payment-intents/${id}/refunds`,
      body,
      () => {
        const pi = findIntent(c.db, merchantId, id);
        const refund = refundIntent(
          c.db,
          pi,
          { amount: amount as number | undefined, reason: (reason as string | undefined) ?? null },
          c.now,
        );
        return ok(refundJson(refund), 201);
      },
    );
  }

  // ----------------------------------------------------------------- API keys

  private listKeys(c: Ctx): DemoResponse {
    return ok(activeKeys(c.db, this.merchantId(c)).map((k) => apiKeyJson(k)));
  }

  private rollKey(c: Ctx): DemoResponse {
    const merchantId = this.merchantId(c);
    const body = objectBody(c.req.body, ['type']);
    const type = body['type'];
    if (type !== 'publishable' && type !== 'secret') {
      throw validationError(['type must be one of the following values: publishable, secret']);
    }
    for (const key of c.db.apiKeys) {
      if (key.merchantId === merchantId && key.type === type && !key.revokedAt) {
        key.revokedAt = iso(c.now);
      }
    }
    const { key, token } = issueApiKey(c.db, merchantId, type, c.now);
    return ok(apiKeyJson(key, type === 'secret' ? token : undefined));
  }

  // ----------------------------------------------------------------- webhooks

  private listEndpoints(c: Ctx): DemoResponse {
    const merchantId = this.merchantId(c);
    return ok(
      c.db.endpoints
        .filter((e) => e.merchantId === merchantId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(endpointJson),
    );
  }

  private endpoint(c: Ctx) {
    const merchantId = this.merchantId(c);
    const endpoint = c.db.endpoints.find(
      (e) => e.id === c.params[0] && e.merchantId === merchantId,
    );
    if (!endpoint) throw new DemoError('NOT_FOUND', `No such webhook_endpoint: ${c.params[0]}`);
    return endpoint;
  }

  private createEndpoint(c: Ctx): DemoResponse {
    const merchantId = this.merchantId(c);
    const body = objectBody(c.req.body, ['url', 'description', 'enabled_events']);
    const url = body['url'];
    const errors: string[] = [];
    if (typeof url !== 'string' || url.length > 2048) errors.push('url must be a string');
    errors.push(...descriptionErrors(body));
    errors.push(...eventErrors(body['enabled_events'], true));
    if (errors.length) throw validationError(errors);
    assertWebhookUrl(url as string);
    if (
      c.db.endpoints.filter((e) => e.merchantId === merchantId).length >= DEMO_LIMITS.maxEndpoints
    ) {
      throw new DemoError(
        'WEBHOOK_ENDPOINT_LIMIT',
        `A merchant can have at most ${DEMO_LIMITS.maxEndpoints} webhook endpoints.`,
        { limit: DEMO_LIMITS.maxEndpoints },
      );
    }
    const endpoint = {
      id: newId('we'),
      merchantId,
      url: url as string,
      description: str(body['description']).trim() || null,
      enabledEvents: normalizeEvents(body['enabled_events'] as string[]),
      status: 'enabled' as const,
      secret: `whsec_${randomBase62(32)}`,
      createdAt: iso(c.now),
      updatedAt: iso(c.now),
    };
    c.db.endpoints.push(endpoint);
    return ok(endpointJson(endpoint), 201);
  }

  private updateEndpoint(c: Ctx): DemoResponse {
    const endpoint = this.endpoint(c);
    const body = objectBody(c.req.body, ['url', 'description', 'enabled_events', 'status']);
    const errors: string[] = [...descriptionErrors(body)];
    if (body['url'] !== undefined && typeof body['url'] !== 'string')
      errors.push('url must be a string');
    if (body['enabled_events'] !== undefined)
      errors.push(...eventErrors(body['enabled_events'], true));
    const status = body['status'];
    if (
      status !== undefined &&
      !WEBHOOK_ENDPOINT_STATUSES.includes(status as WebhookEndpointStatus)
    ) {
      errors.push('status must be one of the following values: enabled, disabled');
    }
    if (errors.length) throw validationError(errors);
    if (body['url'] !== undefined) {
      assertWebhookUrl(body['url'] as string);
      endpoint.url = body['url'] as string;
    }
    if (body['description'] !== undefined) {
      endpoint.description = str(body['description']).trim() || null;
    }
    if (body['enabled_events'] !== undefined) {
      endpoint.enabledEvents = normalizeEvents(body['enabled_events'] as string[]);
    }
    if (status !== undefined) endpoint.status = status as WebhookEndpointStatus;
    endpoint.updatedAt = iso(c.now);
    return ok(endpointJson(endpoint));
  }

  private rollSecret(c: Ctx): DemoResponse {
    const endpoint = this.endpoint(c);
    endpoint.secret = `whsec_${randomBase62(32)}`;
    endpoint.updatedAt = iso(c.now);
    return ok(endpointJson(endpoint));
  }

  private deleteEndpoint(c: Ctx): DemoResponse {
    const endpoint = this.endpoint(c);
    c.db.endpoints = c.db.endpoints.filter((e) => e.id !== endpoint.id);
    c.db.deliveries = c.db.deliveries.filter((d) => d.endpointId !== endpoint.id); // ON DELETE CASCADE
    return { status: 204, body: null };
  }

  private delivery(c: Ctx) {
    const merchantId = this.merchantId(c);
    const delivery = c.db.deliveries.find(
      (d) => d.id === c.params[0] && d.merchantId === merchantId,
    );
    if (!delivery) throw new DemoError('NOT_FOUND', `No such webhook_delivery: ${c.params[0]}`);
    return delivery;
  }

  private listDeliveries(c: Ctx): DemoResponse {
    const merchantId = this.merchantId(c);
    const { status, endpoint, event } = c.req.query;
    if (status && !WEBHOOK_DELIVERY_STATUSES.includes(status as WebhookDeliveryStatus)) {
      throw validationError([
        'status must be one of the following values: pending, succeeded, failed',
      ]);
    }
    const rows = c.db.deliveries
      .filter(
        (d) =>
          d.merchantId === merchantId &&
          (!status || d.status === status) &&
          (!endpoint || d.endpointId === endpoint) &&
          (!event || d.eventId === event),
      )
      .sort(newestFirst);
    return ok(paginate(c, rows, (d) => deliveryJson(c.db, d)));
  }

  private async retryDelivery(c: Ctx): Promise<DemoResponse> {
    const delivery = this.delivery(c);
    await attemptDelivery(c.db, delivery, true, c.now);
    return ok(deliveryJson(c.db, delivery, true));
  }

  // ----------------------------------------------------------------- checkout

  /** POST /payment_methods with the merchant's publishable key (as the real checkout does). */
  private createPaymentMethod(c: Ctx): DemoResponse {
    const token = /^Bearer ((pk|sk)_test_[0-9A-Za-z]{32})$/.exec(
      c.req.header('Authorization') ?? '',
    )?.[1];
    const key = token && c.db.apiKeys.find((k) => k.publishableToken === token && !k.revokedAt);
    if (!key) throw new DemoError('INVALID_API_KEY', 'Missing or invalid publishable API key.');
    const body = objectBody(c.req.body, ['type', 'card', 'pse', 'nequi', 'billing_details']);
    const input = paymentMethodInput(body);
    const pm = tokenize(c.db, key.merchantId, input, c.now);
    key.lastUsedAt = iso(c.now);
    return ok(paymentMethodJson(pm), 201);
  }

  private checkout(c: Ctx): DemoResponse {
    const secret = c.req.query['client_secret'];
    if (!secret || secret.length > 100) {
      throw new DemoError('INVALID_CLIENT_SECRET', 'client_secret is required.');
    }
    return ok(checkoutView(c.db, findByClientSecret(c.db, c.params[0], secret)));
  }

  private async confirm(c: Ctx): Promise<DemoResponse> {
    const body = objectBody(c.req.body, ['client_secret', 'payment_method']);
    const pi = findByClientSecret(c.db, c.params[0], str(body['client_secret']));
    const paymentMethod = str(body['payment_method']);
    if (!/^pm_[0-9A-Za-z]{24}$/.test(paymentMethod)) {
      throw validationError(['payment_method must be a payment method id']);
    }
    return this.idempotent(
      c,
      pi.merchantId,
      `POST /checkout/${pi.id}/confirm`,
      { payment_method: paymentMethod },
      () => {
        confirmIntent(c.db, pi, paymentMethod, c.now);
        return ok(checkoutView(c.db, pi));
      },
    );
  }

  private authenticateCheckout(c: Ctx): DemoResponse {
    const body = objectBody(c.req.body, ['client_secret', 'result']);
    const result = body['result'];
    if (result !== 'approve' && result !== 'reject') {
      throw validationError(['result must be one of the following values: approve, reject']);
    }
    const pi = findByClientSecret(c.db, c.params[0], str(body['client_secret']));
    authenticateIntent(c.db, pi, result, c.now);
    return ok(checkoutView(c.db, pi));
  }
}

// ------------------------------------------------------------------ helpers

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** A JSON object body with only the allowed properties (forbidNonWhitelisted). */
function objectBody(body: unknown, allowed: string[]): Json {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validationError(['request body must be a JSON object']);
  }
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) throw validationError(extra.map((k) => `property ${k} should not exist`));
  return body as Json;
}

function descriptionErrors(body: Json): string[] {
  const value = body['description'];
  if (value === undefined) return [];
  return typeof value === 'string' && value.length <= 200
    ? []
    : ['description must be shorter than or equal to 200 characters'];
}

function eventErrors(value: unknown, required: boolean): string[] {
  if (value === undefined) return required ? ['enabled_events should not be empty'] : [];
  const choices: string[] = [ALL_EVENTS, ...EVENT_TYPES];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    new Set(value).size !== value.length ||
    value.some((v) => !choices.includes(v as string))
  ) {
    return [`each value in enabled_events must be one of: ${choices.join(', ')}`];
  }
  return [];
}

function assertWebhookUrl(url: string): void {
  // The demo has no localhost to talk to: https only, like production.
  const reason = webhookUrlProblem(url, false);
  if (reason) {
    throw new DemoError('INVALID_WEBHOOK_URL', `The webhook URL is not acceptable: ${reason}.`, {
      reason,
    });
  }
}

function paymentMethodInput(body: Json): PaymentMethodInput {
  const type = body['type'];
  const billingRaw = body['billing_details'];
  const billing =
    billingRaw && typeof billingRaw === 'object'
      ? {
          name: str((billingRaw as Json)['name']) || null,
          email: str((billingRaw as Json)['email']) || null,
        }
      : undefined;
  if (type === 'card') {
    const card = body['card'] as Json | undefined;
    const errors: string[] = [];
    if (!card || typeof card !== 'object')
      throw validationError(['card should not be null or undefined']);
    if (typeof card['number'] !== 'string' || card['number'].length > 30) {
      errors.push('card.number must be a string');
    }
    if (
      !Number.isInteger(card['exp_month']) ||
      (card['exp_month'] as number) < 1 ||
      (card['exp_month'] as number) > 12
    ) {
      errors.push('card.exp_month must not be greater than 12');
    }
    if (!Number.isInteger(card['exp_year'])) errors.push('card.exp_year must be an integer number');
    if (typeof card['cvc'] !== 'string' || !/^\d{3,4}$/.test(card['cvc'])) {
      errors.push('card.cvc must be 3 or 4 digits');
    }
    if (errors.length) throw validationError(errors);
    return {
      type,
      card: {
        number: card['number'] as string,
        exp_month: card['exp_month'] as number,
        exp_year: card['exp_year'] as number,
        cvc: card['cvc'] as string,
      },
      billing,
    };
  }
  if (type === 'pse') {
    const pse = body['pse'] as Json | undefined;
    if (!pse || typeof pse['bank'] !== 'string')
      throw validationError(['pse.bank must be a string']);
    const personType = pse['person_type'];
    if (personType !== undefined && !PSE_PERSON_TYPES.includes(personType as 'natural')) {
      throw validationError(['pse.person_type must be one of: natural, juridica']);
    }
    return {
      type,
      pse: { bank: pse['bank'], person_type: personType as 'natural' | 'juridica' | undefined },
      billing,
    };
  }
  if (type === 'nequi') {
    const nequi = body['nequi'] as Json | undefined;
    const phone = str(nequi?.['phone']).replace(/\s/g, '');
    if (!/^3\d{9}$/.test(phone)) {
      throw validationError(['nequi.phone must be a 10-digit Colombian mobile number']);
    }
    return { type, nequi: { phone }, billing };
  }
  throw validationError(['type must be one of the following values: card, pse, nequi']);
}

/** Keyset pagination over rows already sorted newest first. */
function paginate<T extends { id: string; createdAt: string }, R>(
  c: Ctx,
  rows: T[],
  map: (row: T) => R,
) {
  const rawLimit = c.req.query['limit'];
  const limit = rawLimit === undefined ? DEFAULT_PAGE_SIZE : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw validationError(['limit must not be greater than 100']);
  }
  let start = 0;
  const cursor = c.req.query['cursor'];
  if (cursor) {
    const id = decodeCursor(cursor);
    const index = rows.findIndex((row) => row.id === id);
    start = index === -1 ? rows.length : index + 1;
  }
  const page = rows.slice(start, start + limit);
  const hasMore = rows.length > start + limit;
  const last = page.at(-1);
  return {
    object: 'list' as const,
    data: page.map(map),
    has_more: hasMore,
    next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

function encodeCursor(createdAt: string, id: string): string {
  return btoa(JSON.stringify([createdAt, id]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeCursor(raw: string): string {
  try {
    const value = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))) as unknown;
    if (Array.isArray(value) && typeof value[1] === 'string') return value[1];
  } catch {
    // fall through
  }
  throw new DemoError('INVALID_CURSOR', 'The pagination cursor is malformed.');
}

/** JSON with sorted keys: equal payloads → equal fingerprints. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Json)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
