import type { ComponentFixture } from '@angular/core/testing';
import type { AuthResponse, CheckoutView, ProblemDetails, User } from '../app/core/api/api.models';

/** Test-only fixtures and DOM helpers (excluded from the app build). */

export const USER: User = {
  id: 'u-1',
  email: 'ana@example.com',
  full_name: 'Ana María Gómez',
  role: 'OWNER',
  merchant: { id: 'acct_1', business_name: 'Café La Montaña' },
  created_at: '2026-10-01T14:00:00.000Z',
};

export function authResponse(accessToken = 'token-1', user: User = USER): AuthResponse {
  return { access_token: accessToken, token_type: 'Bearer', expires_in: 900, user };
}

export function problem(status: number, code: string, extra: Partial<ProblemDetails> = {}) {
  return {
    type: 'about:blank',
    title: code,
    status,
    code,
    detail: code,
    requestId: 'req-1',
    ...extra,
  } satisfies ProblemDetails;
}

/** Lets pending promises/microtasks run, then renders (zoneless). */
export async function settle(fixture?: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
  if (fixture) await fixture.whenStable();
}

export function el<T extends HTMLElement = HTMLElement>(
  fixture: ComponentFixture<unknown>,
  selector: string,
): T {
  const found = (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  if (!found) throw new Error(`Element not found: ${selector}`);
  return found;
}

export function query(fixture: ComponentFixture<unknown>, selector: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(selector);
}

export function typeInto(fixture: ComponentFixture<unknown>, selector: string, value: string) {
  const input = el<HTMLInputElement | HTMLSelectElement>(fixture, selector);
  input.value = value;
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
}

export function buttonByText(fixture: ComponentFixture<unknown>, text: string): HTMLButtonElement {
  const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
  const match = Array.from(buttons).find((b) => b.textContent?.trim().includes(text));
  if (!match) throw new Error(`Button not found: ${text}`);
  return match;
}

/** "$ 25.000" with a non-breaking space → plain spaces, for readable assertions. */
export function text(node: Element | null): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function checkoutView(overrides: Partial<CheckoutView> = {}): CheckoutView {
  return {
    object: 'checkout',
    id: 'pi_test123',
    amount: 8_990_000,
    amount_refunded: 0,
    currency: 'COP',
    description: 'Audífonos inalámbricos',
    status: 'requires_payment_method',
    merchant: { business_name: 'Tienda Aurora' },
    publishable_key: 'pk_test_abc',
    payment_method_types: ['card', 'pse', 'nequi'],
    payment_method: null,
    next_action: null,
    last_payment_error: null,
    attempts: 0,
    max_attempts: 3,
    return_url: null,
    created_at: '2026-10-02T15:00:00.000Z',
    ...overrides,
  };
}
