/** Same codes, statuses and titles as the API's ERROR_CATALOG (apps/api/src/common/errors). */
const CATALOG = {
  VALIDATION_FAILED: [400, 'Validation failed'],
  UNAUTHORIZED: [401, 'Unauthorized'],
  INVALID_CREDENTIALS: [401, 'Invalid credentials'],
  INVALID_REFRESH_TOKEN: [401, 'Invalid refresh token'],
  INVALID_API_KEY: [401, 'Invalid API key'],
  NOT_FOUND: [404, 'Not found'],
  EMAIL_ALREADY_REGISTERED: [409, 'Email already registered'],
  IDEMPOTENCY_KEY_REQUIRED: [400, 'Idempotency-Key header required'],
  IDEMPOTENCY_KEY_INVALID: [400, 'Invalid Idempotency-Key'],
  IDEMPOTENCY_KEY_REUSED: [422, 'Idempotency-Key reused with a different request'],
  INVALID_WEBHOOK_URL: [400, 'Invalid webhook URL'],
  WEBHOOK_ENDPOINT_LIMIT: [422, 'Webhook endpoint limit reached'],
  INVALID_CARD: [400, 'Invalid card details'],
  INVALID_PAYMENT_METHOD: [400, 'Invalid payment method'],
  INVALID_CLIENT_SECRET: [404, 'Payment not found'],
  PAYMENT_INTENT_UNEXPECTED_STATE: [409, 'Payment intent in an unexpected state'],
  PAYMENT_METHOD_NOT_ALLOWED: [422, 'Payment method type not allowed for this payment'],
  REFUND_EXCEEDS_AMOUNT: [422, 'Refund exceeds the refundable amount'],
  INVALID_CURSOR: [400, 'Invalid pagination cursor'],
  INTERNAL_ERROR: [500, 'Internal server error'],
} as const satisfies Record<string, readonly [number, string]>;

export type DemoErrorCode = keyof typeof CATALOG;

/** A business failure, rendered as RFC 9457 problem+json exactly like the API. */
export class DemoError extends Error {
  constructor(
    readonly code: DemoErrorCode,
    detail: string = CATALOG[code][1],
    readonly extensions: Record<string, unknown> = {},
    readonly errors?: string[],
  ) {
    super(detail);
    this.name = 'DemoError';
  }

  get status(): number {
    return CATALOG[this.code][0];
  }

  toProblem(instance: string): Record<string, unknown> {
    return {
      type: `https://errors.pasarela.dev/${this.code.toLowerCase().replace(/_/g, '-')}`,
      title: CATALOG[this.code][1],
      status: this.status,
      code: this.code,
      detail: this.message,
      instance,
      requestId: `demo-${Math.random().toString(36).slice(2, 10)}`,
      ...(this.errors ? { errors: this.errors } : {}),
      ...this.extensions,
    };
  }
}

export const validationError = (errors: string[]) =>
  new DemoError('VALIDATION_FAILED', 'The request body or parameters are invalid.', {}, errors);
