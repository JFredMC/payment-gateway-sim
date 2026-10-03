import { HttpStatus } from '@nestjs/common';

/**
 * Catalogue of business/API error codes. Clients should branch on `code`,
 * never on the human-readable `detail`.
 */
export const ERROR_CATALOG = {
  VALIDATION_FAILED: { status: HttpStatus.BAD_REQUEST, title: 'Validation failed' },
  UNAUTHORIZED: { status: HttpStatus.UNAUTHORIZED, title: 'Unauthorized' },
  INVALID_CREDENTIALS: { status: HttpStatus.UNAUTHORIZED, title: 'Invalid credentials' },
  INVALID_REFRESH_TOKEN: { status: HttpStatus.UNAUTHORIZED, title: 'Invalid refresh token' },
  REFRESH_TOKEN_REUSED: { status: HttpStatus.UNAUTHORIZED, title: 'Refresh token reused' },
  UNTRUSTED_ORIGIN: { status: HttpStatus.FORBIDDEN, title: 'Untrusted origin' },
  /** Missing, malformed, revoked or wrong-type merchant API key. */
  INVALID_API_KEY: { status: HttpStatus.UNAUTHORIZED, title: 'Invalid API key' },
  FORBIDDEN: { status: HttpStatus.FORBIDDEN, title: 'Forbidden' },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, title: 'Not found' },
  EMAIL_ALREADY_REGISTERED: { status: HttpStatus.CONFLICT, title: 'Email already registered' },
  IDEMPOTENCY_KEY_REQUIRED: {
    status: HttpStatus.BAD_REQUEST,
    title: 'Idempotency-Key header required',
  },
  IDEMPOTENCY_KEY_INVALID: { status: HttpStatus.BAD_REQUEST, title: 'Invalid Idempotency-Key' },
  /** Same key, different request: a client bug, never silently replayed. */
  IDEMPOTENCY_KEY_REUSED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    title: 'Idempotency-Key reused with a different request',
  },
  /** Webhook endpoint URL rejected (`reason`: invalid_url, https_required, credentials_in_url). */
  INVALID_WEBHOOK_URL: { status: HttpStatus.BAD_REQUEST, title: 'Invalid webhook URL' },
  WEBHOOK_ENDPOINT_LIMIT: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    title: 'Webhook endpoint limit reached',
  },
  /** Card data rejected at tokenization (Luhn, brand, length, expiry, CVC). */
  INVALID_CARD: { status: HttpStatus.BAD_REQUEST, title: 'Invalid card details' },
  INVALID_PAYMENT_METHOD: { status: HttpStatus.BAD_REQUEST, title: 'Invalid payment method' },
  INVALID_CLIENT_SECRET: { status: HttpStatus.NOT_FOUND, title: 'Payment not found' },
  /** The operation is not allowed in the payment intent's current status. */
  PAYMENT_INTENT_UNEXPECTED_STATE: {
    status: HttpStatus.CONFLICT,
    title: 'Payment intent in an unexpected state',
  },
  PAYMENT_METHOD_NOT_ALLOWED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    title: 'Payment method type not allowed for this payment',
  },
  REFUND_EXCEEDS_AMOUNT: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    title: 'Refund exceeds the refundable amount',
  },
  INVALID_CURSOR: { status: HttpStatus.BAD_REQUEST, title: 'Invalid pagination cursor' },
  INTERNAL_ERROR: { status: HttpStatus.INTERNAL_SERVER_ERROR, title: 'Internal server error' },
} as const satisfies Record<string, { status: HttpStatus; title: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;
