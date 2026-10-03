import { pseBankByCode } from '../../domain/local-methods';
import { refundState } from '../../domain/payment-intent-state';
import type { PaymentIntent } from './entities/payment-intent.entity';
import type { PaymentMethod } from './entities/payment-method.entity';
import type { Refund } from './entities/refund.entity';

/** Public JSON of a payment method: display data only, never the simulated outcome. */
export function toPaymentMethodJson(pm: PaymentMethod) {
  return {
    id: pm.id,
    object: 'payment_method' as const,
    type: pm.type,
    card:
      pm.type === 'card'
        ? {
            brand: pm.cardBrand,
            last4: pm.cardLast4,
            exp_month: pm.cardExpMonth,
            exp_year: pm.cardExpYear,
            funding: pm.cardFunding,
          }
        : null,
    pse:
      pm.type === 'pse'
        ? {
            bank_code: pm.pseBankCode,
            bank_name: pseBankByCode(pm.pseBankCode ?? '')?.name ?? null,
            person_type: pm.psePersonType,
          }
        : null,
    nequi: pm.type === 'nequi' ? { phone_last4: pm.nequiPhoneLast4 } : null,
    billing_details: { name: pm.billingName, email: pm.billingEmail },
    created_at: pm.createdAt.toISOString(),
  };
}
export type PaymentMethodJson = ReturnType<typeof toPaymentMethodJson>;

/** Stripe-like PaymentIntent. `paymentMethod` should be loaded to expand it. */
export function toPaymentIntentJson(pi: PaymentIntent) {
  return {
    id: pi.id,
    object: 'payment_intent' as const,
    amount: pi.amount,
    amount_received: pi.status === 'succeeded' ? pi.amount : 0,
    amount_refunded: pi.amountRefunded,
    refund_status: refundState(pi.amount, pi.amountRefunded),
    currency: pi.currency,
    status: pi.status,
    description: pi.description,
    customer_email: pi.customerEmail,
    metadata: pi.metadata,
    payment_method_types: pi.paymentMethodTypes,
    payment_method: pi.paymentMethod ? toPaymentMethodJson(pi.paymentMethod) : null,
    client_secret: pi.clientSecret,
    last_payment_error: pi.lastPaymentError,
    next_action: pi.nextAction,
    attempts: pi.attempts,
    return_url: pi.returnUrl,
    cancellation_reason: pi.cancellationReason,
    canceled_at: pi.canceledAt?.toISOString() ?? null,
    succeeded_at: pi.succeededAt?.toISOString() ?? null,
    created_at: pi.createdAt.toISOString(),
    livemode: false as const,
  };
}
export type PaymentIntentJson = ReturnType<typeof toPaymentIntentJson>;

export function toRefundJson(refund: Refund) {
  return {
    id: refund.id,
    object: 'refund' as const,
    payment_intent: refund.paymentIntentId,
    amount: refund.amount,
    currency: 'COP' as const,
    reason: refund.reason,
    status: refund.status,
    created_at: refund.createdAt.toISOString(),
  };
}
export type RefundJson = ReturnType<typeof toRefundJson>;

export interface ListJson<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}
