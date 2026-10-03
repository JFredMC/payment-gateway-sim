import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  checkoutView,
  el,
  problem,
  query,
  settle,
  text,
  typeInto,
} from '../../../testing/fixtures';
import { CheckoutPage } from './checkout.page';

const VIEW_URL = '/api/v1/checkout/pi_test123?client_secret=pi_test123_secret_x';

describe('CheckoutPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CheckoutPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(view = checkoutView()) {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.componentRef.setInput('id', 'pi_test123');
    fixture.componentRef.setInput('secret', 'pi_test123_secret_x');
    await fixture.whenStable();
    http.expectOne(VIEW_URL).flush(view);
    await settle(fixture);
    return fixture;
  }

  async function fillCard(fixture: Awaited<ReturnType<typeof render>>, number: string) {
    typeInto(fixture, '#cc-number', number);
    typeInto(fixture, '#cc-exp', '1234');
    typeInto(fixture, '#cc-cvc', '123');
    typeInto(fixture, '#cc-name', 'Ana Gómez');
    await settle(fixture);
  }

  async function submit(fixture: Awaited<ReturnType<typeof render>>) {
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    await settle(fixture);
  }

  it('shows the merchant, the description and the amount', async () => {
    const fixture = await render();
    expect(text(query(fixture, '[data-testid="checkout-merchant"]'))).toBe('Tienda Aurora');
    expect(text(query(fixture, '[data-testid="checkout-amount"]'))).toBe('$ 89.900');
    expect(text(query(fixture, '[data-testid="pay"]'))).toBe('Pagar $ 89.900');
  });

  it('formats the number and detects the brand while typing', async () => {
    const fixture = await render();
    typeInto(fixture, '#cc-number', '378282246310005');
    await settle(fixture);
    expect(el<HTMLInputElement>(fixture, '#cc-number').value).toBe('3782 822463 10005');
    expect(text(query(fixture, '[data-testid="card-brand"]'))).toBe('American Express');
  });

  it('never calls the API with an invalid card', async () => {
    const fixture = await render();
    await fillCard(fixture, '4242424242424241');
    await submit(fixture);
    http.expectNone('/api/v1/payment_methods');
    expect(text(fixture.nativeElement)).toContain('El número de la tarjeta no es válido.');
  });

  it('tokenizes with the publishable key, then confirms with an Idempotency-Key', async () => {
    const fixture = await render();
    await fillCard(fixture, '4242 4242 4242 4242');
    await submit(fixture);

    const tokenize = http.expectOne('/api/v1/payment_methods');
    expect(tokenize.request.headers.get('Authorization')).toBe('Bearer pk_test_abc');
    expect(tokenize.request.body).toEqual({
      type: 'card',
      card: { number: '4242424242424242', exp_month: 12, exp_year: 2034, cvc: '123' },
      billing_details: { name: 'Ana Gómez' },
    });
    tokenize.flush({ id: 'pm_1' });
    await settle(fixture);

    const confirm = http.expectOne('/api/v1/checkout/pi_test123/confirm');
    expect(confirm.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(confirm.request.body).toEqual({
      client_secret: 'pi_test123_secret_x',
      payment_method: 'pm_1',
    });
    confirm.flush(
      checkoutView({
        status: 'succeeded',
        payment_method: {
          id: 'pm_1',
          object: 'payment_method',
          type: 'card',
          card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2034, funding: 'credit' },
          pse: null,
          nequi: null,
          billing_details: { name: 'Ana Gómez', email: null },
          created_at: '2026-10-02T15:00:00.000Z',
        },
      }),
    );
    await settle(fixture);
    expect(text(query(fixture, '[data-testid="checkout-result"]'))).toContain('¡Pago exitoso!');
    expect(text(query(fixture, '[data-testid="checkout-paid-with"]'))).toBe('Visa •••• 4242');
  });

  it('reuses the token and the Idempotency-Key when retrying after a network error', async () => {
    const fixture = await render();
    await fillCard(fixture, '4242424242424242');
    await submit(fixture);
    http.expectOne('/api/v1/payment_methods').flush({ id: 'pm_1' });
    await settle(fixture);
    const first = http.expectOne('/api/v1/checkout/pi_test123/confirm');
    const key = first.request.headers.get('Idempotency-Key');
    first.error(new ProgressEvent('error'), { status: 0 });
    await settle(fixture);

    await submit(fixture);
    http.expectNone('/api/v1/payment_methods');
    const retry = http.expectOne('/api/v1/checkout/pi_test123/confirm');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    expect(retry.request.body.payment_method).toBe('pm_1');
    retry.flush(checkoutView({ status: 'succeeded' }));
    await settle(fixture);
  });

  it('explains a decline in Spanish with the attempts left', async () => {
    const fixture = await render(
      checkoutView({
        attempts: 1,
        last_payment_error: {
          type: 'card_error',
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'Your card has insufficient funds.',
          payment_method_type: 'card',
        },
      }),
    );
    const decline = text(query(fixture, '[data-testid="decline"]'));
    expect(decline).toContain('La tarjeta no tiene fondos suficientes.');
    expect(decline).toContain('Te quedan 2 intentos.');
  });

  it('maps INVALID_CARD reasons from the API to Spanish', async () => {
    const fixture = await render();
    await fillCard(fixture, '4242424242424242');
    await submit(fixture);
    http
      .expectOne('/api/v1/payment_methods')
      .flush(problem(400, 'INVALID_CARD', { reason: 'invalid_cvc' }), {
        status: 400,
        statusText: 'Bad Request',
      });
    await settle(fixture);
    expect(text(query(fixture, '[data-testid="problem"]'))).toBe(
      'El código de seguridad no es válido para esta tarjeta.',
    );
  });

  it('runs the 3-D Secure challenge and sends the buyer decision', async () => {
    const fixture = await render(
      checkoutView({
        status: 'requires_action',
        next_action: { type: 'three_d_secure', three_d_secure: { brand: 'visa', last4: '3184' } },
      }),
    );
    expect(text(query(fixture, '[data-testid="challenge"]'))).toContain('Visa •••• 3184');
    const approve = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => b.textContent?.includes('Autorizar pago'));
    approve?.click();
    await settle(fixture);

    const req = http.expectOne('/api/v1/checkout/pi_test123/authenticate');
    expect(req.request.body).toEqual({ client_secret: 'pi_test123_secret_x', result: 'approve' });
    req.flush(checkoutView({ status: 'succeeded' }));
    await settle(fixture);
    expect(text(query(fixture, '[data-testid="checkout-result"]'))).toContain('¡Pago exitoso!');
  });

  it('shows a friendly page when the link is invalid', async () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.componentRef.setInput('id', 'pi_test123');
    fixture.componentRef.setInput('secret', 'pi_test123_secret_x');
    await fixture.whenStable();
    http
      .expectOne(VIEW_URL)
      .flush(problem(404, 'INVALID_CLIENT_SECRET'), { status: 404, statusText: 'Not Found' });
    await settle(fixture);
    expect(text(query(fixture, '[data-testid="checkout-invalid"]'))).toContain(
      'Enlace de pago no válido',
    );
  });
});
