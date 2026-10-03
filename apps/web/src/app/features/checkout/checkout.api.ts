import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { API_BASE, IDEMPOTENCY_KEY_HEADER } from '../../core/api/api.config';
import type {
  CheckoutView,
  CreatePaymentMethodBody,
  PaymentMethod,
} from '../../core/api/api.models';

/**
 * Buyer-side calls of the hosted checkout. The page is public: it is authorized
 * by the intent's client_secret, and card tokenization uses the merchant's
 * publishable key (sent explicitly, so the auth interceptor leaves it alone).
 */
@Injectable({ providedIn: 'root' })
export class CheckoutApi {
  private readonly http = inject(HttpClient);

  view(id: string, clientSecret: string): Observable<CheckoutView> {
    return this.http.get<CheckoutView>(`${API_BASE}/checkout/${encodeURIComponent(id)}`, {
      params: { client_secret: clientSecret },
    });
  }

  tokenize(publishableKey: string, body: CreatePaymentMethodBody): Observable<PaymentMethod> {
    return this.http.post<PaymentMethod>(`${API_BASE}/payment_methods`, body, {
      headers: new HttpHeaders({ Authorization: `Bearer ${publishableKey}` }),
    });
  }

  confirm(
    id: string,
    clientSecret: string,
    paymentMethod: string,
    idempotencyKey: string,
  ): Observable<CheckoutView> {
    return this.http.post<CheckoutView>(
      `${API_BASE}/checkout/${encodeURIComponent(id)}/confirm`,
      { client_secret: clientSecret, payment_method: paymentMethod },
      { headers: new HttpHeaders({ [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }) },
    );
  }

  authenticate(
    id: string,
    clientSecret: string,
    result: 'approve' | 'reject',
  ): Observable<CheckoutView> {
    return this.http.post<CheckoutView>(
      `${API_BASE}/checkout/${encodeURIComponent(id)}/authenticate`,
      { client_secret: clientSecret, result },
    );
  }
}
