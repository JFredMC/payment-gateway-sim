import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomBase62 } from '../../common/ids/public-id';
import {
  formatSignatureHeader,
  parseSignatureHeader,
  SIGNATURE_TOLERANCE_SECONDS,
  signedPayload,
} from '../../domain/webhooks';

/** `whsec_` + 32 base62 chars. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBase62(32)}`;
}

export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(signedPayload(timestamp, body)).digest('hex');
}

/** Value of the `Pasarela-Signature` header for a raw body. */
export function signatureHeader(secret: string, body: string, now = Date.now()): string {
  const timestamp = Math.floor(now / 1000);
  return formatSignatureHeader(timestamp, computeSignature(secret, timestamp, body));
}

/**
 * Receiver-side verification, exactly as a merchant should implement it:
 * HMAC over the raw body, constant-time comparison, and a timestamp tolerance
 * against replays. Used by the tests and documented in the README.
 */
export function verifySignature(
  secret: string,
  body: string,
  header: string | undefined,
  now = Date.now(),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  const parsed = header ? parseSignatureHeader(header) : null;
  if (!parsed) return false;
  if (Math.abs(Math.floor(now / 1000) - parsed.timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(computeSignature(secret, parsed.timestamp, body), 'hex');
  return parsed.signatures.some((candidate) => {
    const given = Buffer.from(candidate, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
