/** PaymentIntent lifecycle: the single source of truth for allowed transitions. */

export const PAYMENT_INTENT_STATUSES = [
  'requires_payment_method',
  'requires_action',
  'processing',
  'succeeded',
  'failed',
  'canceled',
] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const PAYMENT_METHOD_TYPES = ['card', 'pse', 'nequi'] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

/** After this many failed attempts the intent becomes `failed` (no more retries). */
export const MAX_PAYMENT_ATTEMPTS = 3;

/** Amount limits in COP minor units (2 decimals): $ 1.000 to $ 20.000.000. */
export const MIN_AMOUNT = 100_000;
export const MAX_AMOUNT = 2_000_000_000;

const TRANSITIONS: Record<PaymentIntentStatus, readonly PaymentIntentStatus[]> = {
  requires_payment_method: ['processing', 'canceled'],
  processing: ['succeeded', 'requires_action', 'requires_payment_method', 'failed'],
  requires_action: ['processing', 'requires_payment_method', 'failed', 'canceled'],
  succeeded: [],
  failed: [],
  canceled: [],
};

export function canTransition(from: PaymentIntentStatus, to: PaymentIntentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: PaymentIntentStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function canConfirm(status: PaymentIntentStatus): boolean {
  return status === 'requires_payment_method';
}

export function canCancel(status: PaymentIntentStatus): boolean {
  return canTransition(status, 'canceled');
}

export function canRefund(status: PaymentIntentStatus, amount: number, refunded: number): boolean {
  return status === 'succeeded' && refunded < amount;
}

export type RefundState = 'none' | 'partial' | 'full';

export function refundState(amount: number, refunded: number): RefundState {
  if (refunded <= 0) return 'none';
  return refunded >= amount ? 'full' : 'partial';
}

/** Where a failed attempt leaves the intent. */
export function statusAfterFailure(attempts: number): PaymentIntentStatus {
  return attempts >= MAX_PAYMENT_ATTEMPTS ? 'failed' : 'requires_payment_method';
}

/** Spanish labels used by the dashboard and the checkout. */
export const STATUS_LABELS_ES: Record<PaymentIntentStatus, string> = {
  requires_payment_method: 'Pendiente de pago',
  requires_action: 'Requiere acción',
  processing: 'Procesando',
  succeeded: 'Exitoso',
  failed: 'Fallido',
  canceled: 'Cancelado',
};

export const METHOD_LABELS_ES: Record<PaymentMethodType, string> = {
  card: 'Tarjeta',
  pse: 'PSE',
  nequi: 'Nequi',
};
