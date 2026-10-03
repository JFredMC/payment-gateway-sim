import {
  formatSignatureHeader,
  isAcknowledged,
  parseSignatureHeader,
  retryDelaySeconds,
  signedPayload,
  type WebhookErrorCode,
  webhookUrlProblem,
} from '../domain/webhooks';
import {
  DEMO_LIMITS,
  type DemoDb,
  type DemoDeliveryAttempt,
  type DemoWebhookDelivery,
  type DemoWebhookEndpoint,
  hmacSha256Hex,
  iso,
} from './demo-db';
import { eventJson } from './demo-engine';

/**
 * Webhooks in the GitHub Pages demo. A static site cannot POST to arbitrary
 * servers, so the receiver is simulated in the browser, but everything else is
 * the real thing: the outbox rows, the HMAC-SHA256 signature over
 * `<t>.<raw body>` (Web Crypto), its verification by the simulated receiver,
 * the retry schedule with exponential backoff and the attempt log.
 *
 * How the simulated receiver answers, by URL:
 *  - host ending in `.invalid`            → connection error (DNS never resolves)
 *  - URL containing `timeout`             → timeout
 *  - URL containing `falla`, `error`, `500` → HTTP 500
 *  - anything else                         → verifies the signature → HTTP 200 (or 400 if invalid)
 */

export interface ReceiverOutcome {
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: WebhookErrorCode | null;
  durationMs: number;
  terminal: boolean;
}

export type SimulatedBehavior = 'ok' | 'http_500' | 'timeout' | 'connection_error';

export function receiverBehavior(url: string): SimulatedBehavior {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'connection_error';
  }
  const lower = url.toLowerCase();
  if (host.endsWith('.invalid')) return 'connection_error';
  if (lower.includes('timeout')) return 'timeout';
  if (/falla|error|500/.test(lower)) return 'http_500';
  return 'ok';
}

const jitterMs = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

/** Builds the signed request and lets the simulated receiver verify it. */
export async function simulateSend(
  endpoint: DemoWebhookEndpoint | undefined,
  body: string | null,
  now: number,
): Promise<ReceiverOutcome> {
  const fail = (errorCode: WebhookErrorCode, terminal = false, durationMs = jitterMs(5, 30)) => ({
    responseStatus: null,
    responseBody: null,
    errorCode,
    durationMs,
    terminal,
  });
  if (!endpoint || body === null || endpoint.status !== 'enabled') {
    return fail('endpoint_disabled', true, 0);
  }
  if (webhookUrlProblem(endpoint.url, false)) return fail('invalid_url', true, 0);

  // Sender side: Pasarela-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "t.body")>.
  const timestamp = Math.floor(now / 1000);
  const header = formatSignatureHeader(
    timestamp,
    await hmacSha256Hex(endpoint.secret, signedPayload(timestamp, body)),
  );

  switch (receiverBehavior(endpoint.url)) {
    case 'connection_error':
      return fail('connection_error', false, jitterMs(20, 80));
    case 'timeout':
      return fail('timeout', false, 10_000);
    case 'http_500':
      return {
        responseStatus: 500,
        responseBody: '{"error":"Error interno del receptor (simulado)"}',
        errorCode: 'http_status',
        durationMs: jitterMs(40, 160),
        terminal: false,
      };
    case 'ok': {
      // Receiver side: recompute the HMAC over the raw body and compare.
      const valid = await verifySimulated(endpoint.secret, body, header, now);
      const status = valid ? 200 : 400;
      return {
        responseStatus: status,
        responseBody: valid
          ? '{"recibido":true,"firma_valida":true}'
          : '{"recibido":false,"error":"firma inválida"}',
        errorCode: isAcknowledged(status) ? null : 'http_status',
        durationMs: jitterMs(35, 140),
        terminal: false,
      };
    }
  }
}

async function verifySimulated(secret: string, body: string, header: string, now: number) {
  const parsed = parseSignatureHeader(header);
  if (!parsed || Math.abs(Math.floor(now / 1000) - parsed.timestamp) > 300) return false;
  const expected = await hmacSha256Hex(secret, signedPayload(parsed.timestamp, body));
  return parsed.signatures.includes(expected);
}

/** Applies one attempt's outcome to a delivery (same rules as WebhookDispatcher.attempt). */
export function applyAttempt(
  delivery: DemoWebhookDelivery,
  outcome: ReceiverOutcome,
  manual: boolean,
  now: number,
): void {
  const attempts = delivery.attempts + 1;
  const entry: DemoDeliveryAttempt = {
    attempt: attempts,
    at: iso(now),
    response_status: outcome.responseStatus,
    duration_ms: outcome.durationMs,
    error_code: outcome.errorCode,
    manual,
  };
  delivery.attempts = attempts;
  delivery.lastAttemptAt = iso(now);
  delivery.responseStatus = outcome.responseStatus;
  delivery.responseBody = outcome.responseBody;
  delivery.errorCode = outcome.errorCode;
  delivery.durationMs = outcome.durationMs;
  delivery.attemptLog = [...delivery.attemptLog, entry].slice(-20);

  if (outcome.errorCode === null) {
    delivery.status = 'succeeded';
    delivery.deliveredAt = iso(now);
    delivery.nextAttemptAt = null;
    return;
  }
  const delay = outcome.terminal
    ? null
    : retryDelaySeconds(attempts, DEMO_LIMITS.webhookRetryBaseSeconds);
  if (delay === null) {
    delivery.status = delivery.deliveredAt ? 'succeeded' : 'failed';
    delivery.nextAttemptAt = null;
  } else {
    delivery.status = delivery.deliveredAt ? 'succeeded' : 'pending';
    delivery.nextAttemptAt = delivery.deliveredAt ? null : iso(now + delay * 1000);
  }
}

export async function attemptDelivery(
  db: DemoDb,
  delivery: DemoWebhookDelivery,
  manual: boolean,
  now: number,
): Promise<void> {
  const endpoint = db.endpoints.find((e) => e.id === delivery.endpointId);
  const event = db.events.find((e) => e.id === delivery.eventId);
  const body = event ? JSON.stringify(eventJson(event)) : null;
  applyAttempt(delivery, await simulateSend(endpoint, body, now), manual, now);
}

/**
 * The "worker": attempts every pending delivery that is due. The demo runs it
 * on each request, so retries happen as time passes while the app is used.
 * Returns how many deliveries were attempted.
 */
export async function dispatchDue(db: DemoDb, now: number): Promise<number> {
  const due = db.deliveries.filter(
    (d) => d.status === 'pending' && d.nextAttemptAt !== null && Date.parse(d.nextAttemptAt) <= now,
  );
  for (const delivery of due) await attemptDelivery(db, delivery, false, now);
  return due.length;
}
