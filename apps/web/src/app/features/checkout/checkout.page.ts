import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { switchMap } from 'rxjs';
import type { CheckoutView, CreatePaymentMethodBody } from '../../core/api/api.models';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { BRANDS } from '../../domain/cards';
import { PSE_BANKS, isColombianMobile, type PsePersonType } from '../../domain/local-methods';
import {
  METHOD_LABELS_ES,
  type PaymentMethodType,
  STATUS_LABELS_ES,
} from '../../domain/payment-intent-state';
import { DECLINES, type DeclineCode, TEST_CARDS } from '../../domain/test-cards';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { IdempotencyKeyTracker } from '../../shared/utils/idempotency-key';
import {
  brandLabel,
  brandOf,
  cvcError,
  expiryError,
  formatExpiryInput,
  formatPanInput,
  panError,
  parseExpiry,
} from './card-form';
import { CheckoutApi } from './checkout.api';
import { ChallengeComponent } from './challenge.component';

type LoadState = 'loading' | 'ready' | 'invalid' | 'error';

/**
 * Hosted checkout (`/checkout/:id?secret=…`). Public page: everything it can do
 * is authorized by the intent's client secret. Card data only goes to the
 * tokenization endpoint; the intent is confirmed with the resulting `pm_` id.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [CopPipe, IconComponent, ProblemAlertComponent, ChallengeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.scss',
})
export class CheckoutPage {
  private readonly api = inject(CheckoutApi);

  /** Route param and query string (withComponentInputBinding). */
  readonly id = input.required<string>();
  readonly secret = input<string>();

  protected readonly loadState = signal<LoadState>('loading');
  protected readonly view = signal<CheckoutView | null>(null);
  protected readonly method = signal<PaymentMethodType>('card');
  protected readonly submitting = signal(false);
  protected readonly problem = signal<AppProblem | null>(null);
  protected readonly showErrors = signal(false);

  // Card fields
  protected readonly pan = signal('');
  protected readonly expiry = signal('');
  protected readonly cvc = signal('');
  protected readonly cardName = signal('');
  // PSE fields
  protected readonly pseBank = signal('');
  protected readonly psePersonType = signal<PsePersonType>('natural');
  // Nequi fields
  protected readonly phone = signal('');

  protected readonly banks = PSE_BANKS;
  protected readonly testCards = TEST_CARDS.map((card) => ({
    ...card,
    display: formatPanInput(card.number),
  }));
  protected readonly statusLabels = STATUS_LABELS_ES;
  protected readonly methodLabels = METHOD_LABELS_ES;

  protected readonly brand = computed(() => brandOf(this.pan()));
  protected readonly brandName = computed(() => brandLabel(this.brand()));
  protected readonly cvcDigits = computed(() => {
    const brand = this.brand();
    return brand ? BRANDS[brand].cvcLength : 3;
  });
  protected readonly panErr = computed(() => panError(this.pan()));
  protected readonly expiryErr = computed(() => expiryError(this.expiry(), new Date()));
  protected readonly cvcErr = computed(() => cvcError(this.cvc(), this.brand()));
  protected readonly nameErr = computed(() =>
    this.cardName().trim() === '' ? 'Ingresa el nombre como aparece en la tarjeta.' : null,
  );
  protected readonly pseErr = computed(() => (this.pseBank() ? null : 'Selecciona tu banco.'));
  protected readonly phoneErr = computed(() => {
    const digits = this.phone().replace(/\s/g, '');
    if (digits === '') return 'Ingresa tu número de celular.';
    return isColombianMobile(digits) ? null : 'Ingresa un celular colombiano de 10 dígitos (3XX).';
  });

  /** Buyer-facing message for the last failed attempt (Spanish, from the shared domain). */
  protected readonly declineMessage = computed(() => {
    const error = this.view()?.last_payment_error;
    if (!error) return null;
    return DECLINES[error.decline_code as DeclineCode]?.messageEs ?? 'El pago no fue aprobado.';
  });
  protected readonly attemptsLeft = computed(() => {
    const view = this.view();
    return view ? Math.max(0, view.max_attempts - view.attempts) : 0;
  });

  protected brandLabelOf(brand: string | undefined): string {
    return brand && brand in BRANDS ? BRANDS[brand as keyof typeof BRANDS].label : 'Tarjeta';
  }

  private readonly confirmKeys = new IdempotencyKeyTracker();
  /** Tokenized method reused when the same data is re-submitted after a network error. */
  private tokenized: { fingerprint: string; id: string } | null = null;

  constructor() {
    effect(() => {
      const id = this.id();
      const secret = this.secret();
      untracked(() => this.load(id, secret));
    });
  }

  protected load(id = this.id(), secret = this.secret()): void {
    if (!secret) {
      this.loadState.set('invalid');
      return;
    }
    this.loadState.set('loading');
    this.api.view(id, secret).subscribe({
      next: (view) => this.applyView(view),
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.loadState.set(problem.status === 404 || problem.status === 400 ? 'invalid' : 'error');
      },
    });
  }

  protected selectMethod(method: PaymentMethodType): void {
    this.method.set(method);
    this.problem.set(null);
    this.showErrors.set(false);
  }

  protected onPanInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const formatted = formatPanInput(target.value);
    target.value = formatted;
    this.pan.set(formatted);
  }

  protected onExpiryInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const formatted = formatExpiryInput(target.value);
    target.value = formatted;
    this.expiry.set(formatted);
  }

  protected onCvcInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const digits = target.value.replace(/\D/g, '').slice(0, this.cvcDigits());
    target.value = digits;
    this.cvc.set(digits);
  }

  protected useTestCard(number: string): void {
    this.method.set('card');
    this.pan.set(formatPanInput(number));
    const year = (new Date().getFullYear() + 3) % 100;
    this.expiry.set(`12/${String(year).padStart(2, '0')}`);
    this.cvc.set(number.startsWith('3') ? '1234' : '123');
    if (this.cardName().trim() === '') this.cardName.set('Comprador de prueba');
    this.problem.set(null);
  }

  protected pay(): void {
    const view = this.view();
    const secret = this.secret();
    if (!view || !secret || this.submitting()) return;
    const body = this.paymentMethodBody();
    if (!body) {
      this.showErrors.set(true);
      return;
    }
    this.submitting.set(true);
    this.problem.set(null);

    const fingerprint = JSON.stringify(body);
    const reuse = this.tokenized?.fingerprint === fingerprint ? this.tokenized.id : null;
    const source$ = reuse
      ? this.api.confirm(view.id, secret, reuse, this.confirmKeys.keyFor({ pm: reuse }))
      : this.api.tokenize(view.publishable_key, body).pipe(
          switchMap((pm) => {
            this.tokenized = { fingerprint, id: pm.id };
            return this.api.confirm(view.id, secret, pm.id, this.confirmKeys.keyFor({ pm: pm.id }));
          }),
        );

    source$.subscribe({
      next: (next) => {
        this.tokenized = null;
        this.confirmKeys.reset();
        this.cvc.set('');
        this.applyView(next);
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        // A definitive rejection of the data means the next submit is a new attempt.
        if (!problem.retryable) {
          this.tokenized = null;
          this.confirmKeys.reset();
        }
        this.problem.set(problem);
        this.submitting.set(false);
        if (problem.code === 'PAYMENT_INTENT_UNEXPECTED_STATE') this.load();
      },
    });
  }

  protected authenticate(result: 'approve' | 'reject'): void {
    const view = this.view();
    const secret = this.secret();
    if (!view || !secret || this.submitting()) return;
    this.submitting.set(true);
    this.problem.set(null);
    this.api.authenticate(view.id, secret, result).subscribe({
      next: (next) => this.applyView(next),
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.submitting.set(false);
        this.load();
      },
    });
  }

  private applyView(view: CheckoutView): void {
    this.view.set(view);
    this.loadState.set('ready');
    this.submitting.set(false);
    this.showErrors.set(false);
    if (!view.payment_method_types.includes(this.method())) {
      this.method.set(view.payment_method_types[0] ?? 'card');
    }
  }

  private paymentMethodBody(): CreatePaymentMethodBody | null {
    switch (this.method()) {
      case 'card': {
        if (this.panErr() || this.expiryErr() || this.cvcErr() || this.nameErr()) return null;
        const expiry = parseExpiry(this.expiry());
        if (!expiry) return null;
        return {
          type: 'card',
          card: {
            number: this.pan().replace(/\s/g, ''),
            exp_month: expiry.month,
            exp_year: expiry.year,
            cvc: this.cvc(),
          },
          billing_details: { name: this.cardName().trim() },
        };
      }
      case 'pse':
        if (this.pseErr()) return null;
        return { type: 'pse', pse: { bank: this.pseBank(), person_type: this.psePersonType() } };
      case 'nequi':
        if (this.phoneErr()) return null;
        return { type: 'nequi', nequi: { phone: this.phone().replace(/\s/g, '') } };
    }
  }
}
