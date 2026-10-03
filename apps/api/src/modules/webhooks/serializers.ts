import { toEventJson } from '../events/event.dto';
import { MAX_WEBHOOK_ATTEMPTS } from '../../domain/webhooks';
import type { WebhookDelivery } from './entities/webhook-delivery.entity';
import type { WebhookEndpoint } from './entities/webhook-endpoint.entity';

export function toWebhookEndpointJson(endpoint: WebhookEndpoint) {
  return {
    id: endpoint.id,
    object: 'webhook_endpoint' as const,
    url: endpoint.url,
    description: endpoint.description,
    enabled_events: endpoint.enabledEvents,
    status: endpoint.status,
    /** Signing secret (dashboard only: needed by the merchant to verify signatures). */
    secret: endpoint.secret,
    created_at: endpoint.createdAt.toISOString(),
    updated_at: endpoint.updatedAt.toISOString(),
  };
}
export type WebhookEndpointJson = ReturnType<typeof toWebhookEndpointJson>;

/** `withPayload` adds the exact event body that is (re)sent. */
export function toWebhookDeliveryJson(delivery: WebhookDelivery, withPayload = false) {
  return {
    id: delivery.id,
    object: 'webhook_delivery' as const,
    endpoint: delivery.endpoint
      ? { id: delivery.endpoint.id, url: delivery.endpoint.url }
      : { id: delivery.endpointId, url: null },
    event: {
      id: delivery.eventId,
      type: delivery.eventType,
      payment_intent: delivery.event?.paymentIntentId ?? null,
    },
    status: delivery.status,
    attempts: delivery.attempts,
    max_attempts: MAX_WEBHOOK_ATTEMPTS,
    next_attempt_at:
      delivery.status === 'pending' ? (delivery.nextAttemptAt?.toISOString() ?? null) : null,
    last_attempt_at: delivery.lastAttemptAt?.toISOString() ?? null,
    response_status: delivery.responseStatus,
    response_body: delivery.responseBody,
    error_code: delivery.errorCode,
    duration_ms: delivery.durationMs,
    attempt_log: delivery.attemptLog,
    delivered_at: delivery.deliveredAt?.toISOString() ?? null,
    created_at: delivery.createdAt.toISOString(),
    ...(withPayload && delivery.event ? { payload: toEventJson(delivery.event) } : {}),
  };
}
export type WebhookDeliveryJson = ReturnType<typeof toWebhookDeliveryJson>;
