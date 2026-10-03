import type { PaymentMethod } from '../../core/api/api.models';
import { BRANDS, type CardBrand } from '../../domain/cards';
import type { PaymentIntentStatus } from '../../domain/payment-intent-state';
import type { WebhookDeliveryStatus } from '../../domain/webhooks';

/** "Visa •••• 4242", "PSE · Banco Caribe de Prueba", "Nequi ••• 4567". */
export function methodSummary(pm: PaymentMethod | null | undefined): string {
  if (!pm) return '—';
  switch (pm.type) {
    case 'card': {
      const brand = pm.card?.brand as CardBrand | undefined;
      return `${brand && BRANDS[brand] ? BRANDS[brand].label : 'Tarjeta'} •••• ${pm.card?.last4 ?? ''}`;
    }
    case 'pse':
      return `PSE · ${pm.pse?.bank_name ?? pm.pse?.bank_code ?? ''}`;
    case 'nequi':
      return `Nequi ••• ${pm.nequi?.phone_last4 ?? ''}`;
  }
}

export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export const STATUS_TONES: Record<PaymentIntentStatus, BadgeTone> = {
  succeeded: 'success',
  failed: 'danger',
  canceled: 'neutral',
  requires_payment_method: 'warning',
  requires_action: 'info',
  processing: 'info',
};

export const DELIVERY_TONES: Record<WebhookDeliveryStatus, BadgeTone> = {
  succeeded: 'success',
  failed: 'danger',
  pending: 'warning',
};

/** Absolute URL of the hosted checkout, respecting the app's base href. */
export function checkoutUrl(id: string, clientSecret: string, baseUri = document.baseURI): string {
  return new URL(`checkout/${id}?secret=${encodeURIComponent(clientSecret)}`, baseUri).href;
}
