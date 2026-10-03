import type { CardBrand } from './cards';

/**
 * Test cards. The simulated outcome is decided when the card is tokenized and stored
 * on the payment method, so the full number is never needed again (nor stored).
 */

export type DeclineCode =
  | 'generic_decline'
  | 'insufficient_funds'
  | 'expired_card'
  | 'incorrect_cvc'
  | 'processing_error'
  | 'authentication_failed'
  | 'payment_rejected';

export type SimulatedOutcome =
  { kind: 'succeed' } | { kind: 'decline'; declineCode: DeclineCode } | { kind: 'challenge' };

export interface TestCard {
  number: string;
  brand: CardBrand;
  funding: 'credit' | 'debit';
  outcome: SimulatedOutcome;
  /** Spanish label for the checkout's test-card helper. */
  label: string;
}

export const TEST_CARDS: readonly TestCard[] = [
  {
    number: '4242424242424242',
    brand: 'visa',
    funding: 'credit',
    outcome: { kind: 'succeed' },
    label: 'Pago aprobado',
  },
  {
    number: '5555555555554444',
    brand: 'mastercard',
    funding: 'credit',
    outcome: { kind: 'succeed' },
    label: 'Pago aprobado (Mastercard)',
  },
  {
    number: '378282246310005',
    brand: 'amex',
    funding: 'credit',
    outcome: { kind: 'succeed' },
    label: 'Pago aprobado (Amex)',
  },
  {
    number: '4000056655665556',
    brand: 'visa',
    funding: 'debit',
    outcome: { kind: 'succeed' },
    label: 'Pago aprobado (débito)',
  },
  {
    number: '4000002760003184',
    brand: 'visa',
    funding: 'credit',
    outcome: { kind: 'challenge' },
    label: 'Requiere autenticación 3DS',
  },
  {
    number: '4000000000000002',
    brand: 'visa',
    funding: 'credit',
    outcome: { kind: 'decline', declineCode: 'generic_decline' },
    label: 'Rechazada (genérico)',
  },
  {
    number: '4000000000009995',
    brand: 'visa',
    funding: 'credit',
    outcome: { kind: 'decline', declineCode: 'insufficient_funds' },
    label: 'Fondos insuficientes',
  },
  {
    number: '4000000000000069',
    brand: 'visa',
    funding: 'credit',
    outcome: { kind: 'decline', declineCode: 'expired_card' },
    label: 'Tarjeta vencida',
  },
  {
    number: '4000000000000127',
    brand: 'visa',
    funding: 'credit',
    outcome: { kind: 'decline', declineCode: 'incorrect_cvc' },
    label: 'CVC incorrecto',
  },
  {
    number: '4000000000000119',
    brand: 'visa',
    funding: 'credit',
    outcome: { kind: 'decline', declineCode: 'processing_error' },
    label: 'Error de procesamiento',
  },
];

/** Any other valid number is approved. */
export function simulateCardOutcome(pan: string): SimulatedOutcome {
  return TEST_CARDS.find((card) => card.number === pan)?.outcome ?? { kind: 'succeed' };
}

export function fundingOf(pan: string): 'credit' | 'debit' {
  return TEST_CARDS.find((card) => card.number === pan)?.funding ?? 'credit';
}

/** Compact, storable form of an outcome (payment_methods.simulated_outcome). */
export function encodeOutcome(outcome: SimulatedOutcome): string {
  return outcome.kind === 'decline' ? `decline:${outcome.declineCode}` : outcome.kind;
}

export function decodeOutcome(value: string): SimulatedOutcome {
  if (value === 'succeed' || value === 'challenge') return { kind: value };
  const [kind, code] = value.split(':');
  if (kind === 'decline' && code && code in DECLINES) {
    return { kind: 'decline', declineCode: code as DeclineCode };
  }
  throw new Error(`Unknown simulated outcome: ${value}`);
}

export interface DeclineInfo {
  /** `last_payment_error.code` (Stripe-like). */
  errorCode:
    | 'card_declined'
    | 'expired_card'
    | 'incorrect_cvc'
    | 'processing_error'
    | 'payment_intent_authentication_failure'
    | 'payment_method_rejected';
  /** Developer-facing message (API). */
  message: string;
  /** Buyer-facing message (checkout, Spanish). */
  messageEs: string;
}

export const DECLINES: Record<DeclineCode, DeclineInfo> = {
  generic_decline: {
    errorCode: 'card_declined',
    message: 'Your card was declined.',
    messageEs: 'Tu tarjeta fue rechazada. Intenta con otro medio de pago.',
  },
  insufficient_funds: {
    errorCode: 'card_declined',
    message: 'Your card has insufficient funds.',
    messageEs: 'La tarjeta no tiene fondos suficientes.',
  },
  expired_card: {
    errorCode: 'expired_card',
    message: 'Your card has expired.',
    messageEs: 'La tarjeta está vencida.',
  },
  incorrect_cvc: {
    errorCode: 'incorrect_cvc',
    message: "Your card's security code is incorrect.",
    messageEs: 'El código de seguridad (CVC) es incorrecto.',
  },
  processing_error: {
    errorCode: 'processing_error',
    message: 'An error occurred while processing your card. Try again.',
    messageEs: 'Ocurrió un error al procesar la tarjeta. Inténtalo de nuevo.',
  },
  authentication_failed: {
    errorCode: 'payment_intent_authentication_failure',
    message: 'The payment could not be authenticated.',
    messageEs: 'No se pudo autenticar el pago.',
  },
  payment_rejected: {
    errorCode: 'payment_method_rejected',
    message: 'The payment was rejected by the customer or the bank.',
    messageEs: 'El pago fue rechazado en el banco o en la aplicación.',
  },
};
