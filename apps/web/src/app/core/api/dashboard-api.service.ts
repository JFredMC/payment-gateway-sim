import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { PaymentIntentStatus } from '../../domain/payment-intent-state';
import type { WebhookDeliveryStatus } from '../../domain/webhooks';
import { API_BASE, IDEMPOTENCY_KEY_HEADER } from './api.config';
import type {
  ApiKey,
  CancellationReason,
  CreatePaymentIntentBody,
  DashboardSummary,
  ListResponse,
  PaymentIntent,
  PaymentIntentDetail,
  Refund,
  RefundReason,
  WebhookDelivery,
  WebhookEndpoint,
} from './api.models';

const BASE = `${API_BASE}/dashboard`;

function params(values: Record<string, string | number | undefined | null>): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') result = result.set(key, value);
  }
  return result;
}

const idempotent = (key: string) => ({
  headers: new HttpHeaders({ [IDEMPOTENCY_KEY_HEADER]: key }),
});

/** Merchant dashboard endpoints (JWT session, added by the auth interceptor). */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  summary(days: 7 | 30): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${BASE}/summary`, { params: params({ days }) });
  }

  payments(
    query: { status?: PaymentIntentStatus | null; cursor?: string | null; limit?: number } = {},
  ): Observable<ListResponse<PaymentIntent>> {
    return this.http.get<ListResponse<PaymentIntent>>(`${BASE}/payment-intents`, {
      params: params(query),
    });
  }

  payment(id: string): Observable<PaymentIntentDetail> {
    return this.http.get<PaymentIntentDetail>(`${BASE}/payment-intents/${encodeURIComponent(id)}`);
  }

  createPayment(body: CreatePaymentIntentBody, key: string): Observable<PaymentIntent> {
    return this.http.post<PaymentIntent>(`${BASE}/payment-intents`, body, idempotent(key));
  }

  cancelPayment(id: string, reason?: CancellationReason): Observable<PaymentIntent> {
    return this.http.post<PaymentIntent>(
      `${BASE}/payment-intents/${encodeURIComponent(id)}/cancel`,
      reason ? { cancellation_reason: reason } : {},
    );
  }

  refund(
    id: string,
    body: { amount?: number; reason?: RefundReason },
    key: string,
  ): Observable<Refund> {
    return this.http.post<Refund>(
      `${BASE}/payment-intents/${encodeURIComponent(id)}/refunds`,
      body,
      idempotent(key),
    );
  }

  apiKeys(): Observable<ApiKey[]> {
    return this.http.get<ApiKey[]>(`${BASE}/api-keys`);
  }

  rollKey(type: ApiKey['type']): Observable<ApiKey> {
    return this.http.post<ApiKey>(`${BASE}/api-keys/roll`, { type });
  }

  webhookEndpoints(): Observable<WebhookEndpoint[]> {
    return this.http.get<WebhookEndpoint[]>(`${BASE}/webhook-endpoints`);
  }

  createWebhookEndpoint(body: {
    url: string;
    description?: string;
    enabled_events: string[];
  }): Observable<WebhookEndpoint> {
    return this.http.post<WebhookEndpoint>(`${BASE}/webhook-endpoints`, body);
  }

  updateWebhookEndpoint(
    id: string,
    patch: Partial<Pick<WebhookEndpoint, 'url' | 'description' | 'enabled_events' | 'status'>>,
  ): Observable<WebhookEndpoint> {
    return this.http.patch<WebhookEndpoint>(
      `${BASE}/webhook-endpoints/${encodeURIComponent(id)}`,
      patch,
    );
  }

  rollWebhookSecret(id: string): Observable<WebhookEndpoint> {
    return this.http.post<WebhookEndpoint>(
      `${BASE}/webhook-endpoints/${encodeURIComponent(id)}/roll-secret`,
      {},
    );
  }

  deleteWebhookEndpoint(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/webhook-endpoints/${encodeURIComponent(id)}`);
  }

  deliveries(
    query: {
      endpoint?: string | null;
      status?: WebhookDeliveryStatus | null;
      cursor?: string | null;
      limit?: number;
    } = {},
  ): Observable<ListResponse<WebhookDelivery>> {
    return this.http.get<ListResponse<WebhookDelivery>>(`${BASE}/webhook-deliveries`, {
      params: params(query),
    });
  }

  delivery(id: string): Observable<WebhookDelivery> {
    return this.http.get<WebhookDelivery>(`${BASE}/webhook-deliveries/${encodeURIComponent(id)}`);
  }

  retryDelivery(id: string): Observable<WebhookDelivery> {
    return this.http.post<WebhookDelivery>(
      `${BASE}/webhook-deliveries/${encodeURIComponent(id)}/retry`,
      {},
    );
  }
}
