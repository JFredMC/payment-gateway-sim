import type { GatewayEvent } from './entities/event.entity';

/** Stripe-like event envelope (also the webhook payload). */
export interface EventJson {
  id: string;
  object: 'event';
  type: GatewayEvent['type'];
  created_at: string;
  livemode: false;
  data: { object: Record<string, unknown> };
}

export function toEventJson(event: GatewayEvent): EventJson {
  return {
    id: event.id,
    object: 'event',
    type: event.type,
    created_at: event.createdAt.toISOString(),
    livemode: false,
    data: { object: event.data },
  };
}
