import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  buttonByText,
  el,
  paymentDetail,
  paymentIntent,
  problem,
  query,
  settle,
  text,
  typeInto,
} from '../../../testing/fixtures';
import { PaymentDetailPage } from './payment-detail.page';

const DETAIL_URL = '/api/v1/dashboard/payment-intents/pi_test123';

describe('PaymentDetailPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PaymentDetailPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(detail = paymentDetail()) {
    const fixture = TestBed.createComponent(PaymentDetailPage);
    fixture.componentRef.setInput('id', 'pi_test123');
    await fixture.whenStable();
    http.expectOne(DETAIL_URL).flush(detail);
    await settle(fixture);
    return fixture;
  }

  it('renders status, amount, card summary and timeline', async () => {
    const fixture = await render();
    expect(text(el(fixture, '[data-testid="detail-status"]'))).toBe('Exitoso');
    expect(text(el(fixture, '[data-testid="detail-amount"]'))).toBe('$ 89.900');
    expect(text(el(fixture, '[data-testid="detail-method"]'))).toBe('Visa •••• 4242');
    expect(text(el(fixture, '[data-testid="timeline"]'))).toContain('Pago creado');
    // A succeeded payment can be refunded but not canceled.
    expect(buttonByText(fixture, 'Reembolsar')).toBeTruthy();
    expect(query(fixture, '[data-testid="detail-checkout"]')).toBeNull();
  });

  it('validates the refund amount and sends a partial refund with an Idempotency-Key', async () => {
    const fixture = await render();
    buttonByText(fixture, 'Reembolsar').click();
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#refund-amount').value).toBe('89900');

    typeInto(fixture, '#refund-amount', '100.000');
    el(fixture, '.refund-form').dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(text(el(fixture, '.field-error'))).toBe('El máximo reembolsable es $ 89.900.');

    typeInto(fixture, '#refund-amount', '20.000');
    el(fixture, '.refund-form').dispatchEvent(new Event('submit'));
    await settle(fixture);
    const req = http.expectOne(`${DETAIL_URL}/refunds`);
    expect(req.request.body).toEqual({ amount: 2_000_000 });
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    req.flush({
      id: 're_1',
      object: 'refund',
      payment_intent: 'pi_test123',
      amount: 2_000_000,
      currency: 'COP',
      reason: null,
      status: 'succeeded',
      created_at: '2026-10-02T15:05:00.000Z',
    });
    http
      .expectOne(DETAIL_URL)
      .flush(
        paymentDetail(paymentIntent({ amount_refunded: 2_000_000, refund_status: 'partial' })),
      );
    await settle(fixture);
    expect(text(el(fixture, '[role="status"]'))).toBe('Reembolso de $ 20.000 creado.');
    expect(text(fixture.nativeElement as Element)).toContain('Reembolso parcial · $ 20.000');
  });

  it('cancels a pending payment', async () => {
    const fixture = await render(
      paymentDetail(paymentIntent({ status: 'requires_payment_method', payment_method: null })),
    );
    expect(query(fixture, '[data-testid="detail-checkout"]')).not.toBeNull();
    buttonByText(fixture, 'Cancelar pago').click();
    await settle(fixture);
    buttonByText(fixture, 'Confirmar cancelación').click();
    const req = http.expectOne(`${DETAIL_URL}/cancel`);
    expect(req.request.method).toBe('POST');
    req.flush(paymentIntent({ status: 'canceled' }));
    http.expectOne(DETAIL_URL).flush(paymentDetail(paymentIntent({ status: 'canceled' })));
    await settle(fixture);
    expect(text(el(fixture, '[data-testid="detail-status"]'))).toBe('Cancelado');
  });

  it('shows a not-found state for unknown ids', async () => {
    const fixture = TestBed.createComponent(PaymentDetailPage);
    fixture.componentRef.setInput('id', 'pi_test123');
    await fixture.whenStable();
    http
      .expectOne(DETAIL_URL)
      .flush(problem(404, 'NOT_FOUND'), { status: 404, statusText: 'Not Found' });
    await settle(fixture);
    expect(text(fixture.nativeElement as Element)).toContain('Pago no encontrado');
  });
});
