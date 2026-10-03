import type { CardBrand } from '../../domain/cards';
import type { EventType } from '../../domain/events';
import type {
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
  WebhookErrorCode,
} from '../../domain/webhooks';
import type {
  PaymentIntentStatus,
  PaymentMethodType,
  RefundState,
} from '../../domain/payment-intent-state';

/**
 * API contracts. JSON is snake_case (Stripe-style); amounts are integer minor
 * units of COP (`amount: 2500000` = $ 25.000).
 */

export interface UserMerchant {
  id: string;
  business_name: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'OWNER';
  merchant: UserMerchant;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: User;
}

/** RFC 9457 problem details returned by the API for every error. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance?: string;
  requestId?: string;
  errors?: string[];
  [extension: string]: unknown;
}

// ---------------------------------------------------------------------------
// Payments (mirrors apps/api/src/modules/payments/serializers.ts)
// ---------------------------------------------------------------------------

export interface PaymentMethod {
  id: string;
  object: 'payment_method';
  type: PaymentMethodType;
  card: {
    brand: CardBrand;
    last4: string;
    exp_month: number;
    exp_year: number;
    funding: 'credit' | 'debit';
  } | null;
  pse: { bank_code: string; bank_name: string | null; person_type: string } | null;
  nequi: { phone_last4: string } | null;
  billing_details: { name: string | null; email: string | null };
  created_at: string;
}

export interface LastPaymentError {
  type: 'card_error' | 'payment_method_error';
  code: string;
  decline_code: string;
  message: string;
  payment_method_type: PaymentMethodType;
}

export type NextAction =
  | { type: 'three_d_secure'; three_d_secure: { brand: string; last4: string } }
  | { type: 'pse_redirect'; pse_redirect: { bank_code: string; bank_name: string } }
  | { type: 'nequi_push'; nequi_push: { phone: string } };

export interface PaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  amount_received: number;
  amount_refunded: number;
  refund_status: RefundState;
  currency: 'COP';
  status: PaymentIntentStatus;
  description: string | null;
  customer_email: string | null;
  metadata: Record<string, string>;
  payment_method_types: PaymentMethodType[];
  payment_method: PaymentMethod | null;
  client_secret: string;
  last_payment_error: LastPaymentError | null;
  next_action: NextAction | null;
  attempts: number;
  return_url: string | null;
  cancellation_reason: string | null;
  canceled_at: string | null;
  succeeded_at: string | null;
  created_at: string;
  livemode: false;
}

export interface Refund {
  id: string;
  object: 'refund';
  payment_intent: string;
  amount: number;
  currency: 'COP';
  reason: string | null;
  status: 'succeeded';
  created_at: string;
}

export interface ListResponse<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/** Buyer-facing view returned by the public `/checkout/:id` endpoints. */
export interface CheckoutView {
  object: 'checkout';
  id: string;
  amount: number;
  amount_refunded: number;
  currency: 'COP';
  description: string | null;
  status: PaymentIntentStatus;
  merchant: { business_name: string };
  publishable_key: string;
  payment_method_types: PaymentMethodType[];
  payment_method: PaymentMethod | null;
  next_action: NextAction | null;
  last_payment_error: LastPaymentError | null;
  attempts: number;
  max_attempts: number;
  return_url: string | null;
  created_at: string;
}

export type CreatePaymentMethodBody =
  | {
      type: 'card';
      card: { number: string; exp_month: number; exp_year: number; cvc: string };
      billing_details?: { name?: string; email?: string };
    }
  | {
      type: 'pse';
      pse: { bank: string; person_type: 'natural' | 'juridica' };
      billing_details?: { name?: string; email?: string };
    }
  | {
      type: 'nequi';
      nequi: { phone: string };
      billing_details?: { name?: string; email?: string };
    };

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  object: 'dashboard_summary';
  currency: 'COP';
  period: { days: number; from: string; to: string; time_zone: string };
  gross_volume: number;
  refunded_amount: number;
  net_volume: number;
  succeeded_count: number;
  average_ticket: number;
  approval_rate: number | null;
  failed_attempts: number;
  pending_count: number;
  by_method: { type: PaymentMethodType; count: number; volume: number }[];
  daily: { date: string; volume: number; count: number }[];
}

export interface GatewayEvent {
  id: string;
  object: 'event';
  type: EventType;
  created_at: string;
  livemode: false;
  data: { object: Record<string, unknown> };
}

export interface DeliveryAttempt {
  attempt: number;
  at: string;
  response_status: number | null;
  duration_ms: number;
  error_code: WebhookErrorCode | null;
  manual: boolean;
}

export interface WebhookDelivery {
  id: string;
  object: 'webhook_delivery';
  endpoint: { id: string; url: string | null };
  event: { id: string; type: EventType; payment_intent: string | null };
  status: WebhookDeliveryStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  response_status: number | null;
  response_body: string | null;
  error_code: WebhookErrorCode | null;
  duration_ms: number | null;
  attempt_log: DeliveryAttempt[];
  delivered_at: string | null;
  created_at: string;
  payload?: GatewayEvent;
}

export interface WebhookEndpoint {
  id: string;
  object: 'webhook_endpoint';
  url: string;
  description: string | null;
  enabled_events: string[];
  status: WebhookEndpointStatus;
  secret: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentIntentDetail {
  object: 'payment_intent_detail';
  payment_intent: PaymentIntent;
  refunds: Refund[];
  timeline: GatewayEvent[];
  webhook_deliveries: WebhookDelivery[];
}

export interface ApiKey {
  id: string;
  object: 'api_key';
  type: 'publishable' | 'secret';
  token: string;
  secret?: string;
  created_at: string;
  last_used_at: string | null;
}

export interface CreatePaymentIntentBody {
  amount: number;
  description?: string;
  customer_email?: string;
  payment_method_types?: PaymentMethodType[];
  return_url?: string;
}

export type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer';
export type CancellationReason = 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'abandoned';
