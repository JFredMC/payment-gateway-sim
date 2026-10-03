import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { PaymentIntent } from '../../core/api/api.models';
import { DashboardApi } from '../../core/api/dashboard-api.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import {
  MAX_AMOUNT,
  METHOD_LABELS_ES,
  MIN_AMOUNT,
  PAYMENT_METHOD_TYPES,
  type PaymentMethodType,
} from '../../domain/payment-intent-state';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { CopyButtonComponent } from '../../shared/ui/copy-button.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { IdempotencyKeyTracker } from '../../shared/utils/idempotency-key';
import { formatCop, parseCopInput } from '../../shared/utils/money';
import { checkoutUrl } from '../../shared/utils/payments';

/** `/pagos/nuevo`: creates a test payment and hands out its checkout link. */
@Component({
  selector: 'app-new-payment-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CopPipe,
    CopyButtonComponent,
    IconComponent,
    ProblemAlertComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-payment.page.html',
})
export class NewPaymentPage {
  private readonly api = inject(DashboardApi);

  protected readonly methodTypes = PAYMENT_METHOD_TYPES;
  protected readonly methodLabels = METHOD_LABELS_ES;
  protected readonly minLabel = formatCop(MIN_AMOUNT);
  protected readonly maxLabel = formatCop(MAX_AMOUNT);

  protected readonly form = inject(NonNullableFormBuilder).group({
    amount: ['', [Validators.required]],
    description: ['', [Validators.maxLength(200)]],
    customerEmail: ['', [Validators.email]],
    card: [true],
    pse: [true],
    nequi: [true],
  });

  protected readonly submitting = signal(false);
  protected readonly problem = signal<AppProblem | null>(null);
  protected readonly amountError = signal<string | null>(null);
  protected readonly methodsError = signal(false);
  protected readonly created = signal<PaymentIntent | null>(null);
  protected readonly link = signal('');

  private readonly keys = new IdempotencyKeyTracker();

  protected submit(): void {
    const value = this.form.getRawValue();
    const amount = parseCopInput(value.amount);
    this.amountError.set(
      amount === null
        ? 'Ingresa un monto válido en pesos (por ejemplo 45.000).'
        : amount < MIN_AMOUNT || amount > MAX_AMOUNT
          ? `El monto debe estar entre ${this.minLabel} y ${this.maxLabel}.`
          : null,
    );
    const methods = this.methodTypes.filter((type) => value[type]);
    this.methodsError.set(methods.length === 0);
    if (this.form.invalid || this.amountError() || methods.length === 0 || amount === null) {
      this.form.markAllAsTouched();
      return;
    }

    const body = {
      amount,
      payment_method_types: methods as PaymentMethodType[],
      ...(value.description.trim() ? { description: value.description.trim() } : {}),
      ...(value.customerEmail.trim() ? { customer_email: value.customerEmail.trim() } : {}),
    };
    this.submitting.set(true);
    this.problem.set(null);
    this.api.createPayment(body, this.keys.keyFor(body)).subscribe({
      next: (intent) => {
        this.keys.reset();
        this.created.set(intent);
        this.link.set(checkoutUrl(intent.id, intent.client_secret));
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.submitting.set(false);
      },
    });
  }

  protected another(): void {
    this.created.set(null);
    this.form.reset({
      amount: '',
      description: '',
      customerEmail: '',
      card: true,
      pse: true,
      nequi: true,
    });
  }
}
