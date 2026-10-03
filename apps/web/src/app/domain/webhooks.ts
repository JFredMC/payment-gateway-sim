/** Webhook delivery rules shared by the API worker and the browser demo backend. */
import type { EventType } from './events';

/** Total delivery attempts (the first one + retries) before a delivery is `failed`. */
export const MAX_WEBHOOK_ATTEMPTS = 6;

/** Each retry waits `base * RETRY_FACTOR^(attempt - 1)` seconds (+/- 10 % jitter). */
export const RETRY_FACTOR = 5;

/** Header carrying `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`. */
export const SIGNATURE_HEADER = 'Pasarela-Signature';

/** Receivers should reject signatures older than this (replay protection). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Listen to every event type. */
export const ALL_EVENTS = '*';

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export const WEBHOOK_ENDPOINT_STATUSES = ['enabled', 'disabled'] as const;
export type WebhookEndpointStatus = (typeof WEBHOOK_ENDPOINT_STATUSES)[number];

/** Why an attempt failed (stored as a code, labelled in the UI). */
export const WEBHOOK_ERROR_CODES = [
  'http_status',
  'timeout',
  'connection_error',
  'blocked_address',
  'invalid_url',
  'endpoint_disabled',
] as const;
export type WebhookErrorCode = (typeof WEBHOOK_ERROR_CODES)[number];

/** The exact string that gets signed. */
export function signedPayload(timestamp: number, body: string): string {
  return `${timestamp}.${body}`;
}

export function formatSignatureHeader(timestamp: number, signatureHex: string): string {
  return `t=${timestamp},v1=${signatureHex}`;
}

/** Parses `t=…,v1=…[,v1=…]`. Several v1 values may appear while a secret is being rolled. */
export function parseSignatureHeader(
  header: string,
): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't' && value && /^\d+$/.test(value)) timestamp = Number(value);
    else if (key === 'v1' && value && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
  }
  return timestamp !== null && signatures.length > 0 ? { timestamp, signatures } : null;
}

/** Whether an endpoint subscribed to `type`. */
export function listensTo(enabledEvents: readonly string[], type: EventType): boolean {
  return enabledEvents.includes(ALL_EVENTS) || enabledEvents.includes(type);
}

/**
 * Delay before the next attempt after `attempt` (1-based) failed, or null when
 * no attempts are left. `random` is injectable for deterministic tests.
 */
export function retryDelaySeconds(
  attempt: number,
  baseSeconds: number,
  random: () => number = Math.random,
): number | null {
  if (attempt >= MAX_WEBHOOK_ATTEMPTS) return null;
  const nominal = baseSeconds * RETRY_FACTOR ** (attempt - 1);
  const jitter = 1 + (random() * 0.2 - 0.1);
  return Math.round(nominal * jitter * 1000) / 1000;
}

/** A 2xx response acknowledges the event; anything else is retried. */
export function isAcknowledged(status: number): boolean {
  return status >= 200 && status < 300;
}

/** Endpoint URL rule: https, or http when local/insecure targets are allowed (dev). */
export function webhookUrlProblem(url: string, allowInsecure: boolean): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'invalid_url';
  }
  if (parsed.username || parsed.password) return 'credentials_in_url';
  if (parsed.protocol === 'https:') return null;
  if (parsed.protocol === 'http:' && allowInsecure) return null;
  return parsed.protocol === 'http:' ? 'https_required' : 'invalid_url';
}

export const DELIVERY_STATUS_LABELS_ES: Record<WebhookDeliveryStatus, string> = {
  pending: 'Pendiente',
  succeeded: 'Entregado',
  failed: 'Fallido',
};

export const WEBHOOK_ERROR_LABELS_ES: Record<WebhookErrorCode, string> = {
  http_status: 'El endpoint respondió con un código distinto de 2xx',
  timeout: 'Tiempo de espera agotado',
  connection_error: 'No se pudo conectar con el endpoint',
  blocked_address: 'Dirección bloqueada (red privada o local)',
  invalid_url: 'URL no válida',
  endpoint_disabled: 'El endpoint está deshabilitado',
};
