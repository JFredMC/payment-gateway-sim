/** Event types: they feed the payment timeline and the webhooks. */
export const EVENT_TYPES = [
  'payment_intent.created',
  'payment_intent.processing',
  'payment_intent.requires_action',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'refund.created',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABELS_ES: Record<EventType, string> = {
  'payment_intent.created': 'Pago creado',
  'payment_intent.processing': 'Procesando pago',
  'payment_intent.requires_action': 'Esperando autenticación del comprador',
  'payment_intent.succeeded': 'Pago exitoso',
  'payment_intent.payment_failed': 'Intento de pago fallido',
  'payment_intent.canceled': 'Pago cancelado',
  'refund.created': 'Reembolso creado',
};
