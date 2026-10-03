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
import { RouterLink } from '@angular/router';
import type {
  CancellationReason,
  PaymentIntentDetail,
  RefundReason,
} from '../../core/api/api.models';
import { DashboardApi } from '../../core/api/dashboard-api.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { EVENT_LABELS_ES } from '../../domain/events';
import {
  canCancel,
  canRefund,
  METHOD_LABELS_ES,
  STATUS_LABELS_ES,
} from '../../domain/payment-intent-state';
import { DECLINES, type DeclineCode } from '../../domain/test-cards';
import { DELIVERY_STATUS_LABELS_ES } from '../../domain/webhooks';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { DateTimePipe } from '../../shared/pipes/date-time.pipe';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { CopyButtonComponent } from '../../shared/ui/copy-button.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { IdempotencyKeyTracker } from '../../shared/utils/idempotency-key';
import { formatCop, minorToInput, parseCopInput } from '../../shared/utils/money';
import {
  checkoutUrl,
  DELIVERY_TONES,
  methodSummary,
  STATUS_TONES,
} from '../../shared/utils/payments';

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  requested_by_customer: 'Solicitado por el cliente',
  duplicate: 'Cobro duplicado',
  fraudulent: 'Fraudulento',
};

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  requested_by_customer: 'Solicitado por el cliente',
  abandoned: 'Compra abandonada',
  duplicate: 'Duplicado',
  fraudulent: 'Fraudulento',
};

type Panel = 'none' | 'refund' | 'cancel';

/** `/pagos/:id`: payment detail with timeline, refunds and webhook deliveries. */
@Component({
  selector: 'app-payment-detail-page',
  imports: [
    RouterLink,
    CopPipe,
    DateTimePipe,
    BadgeComponent,
    CopyButtonComponent,
    IconComponent,
    ProblemAlertComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payment-detail.page.html',
  styleUrl: './payment-detail.page.scss',
})
export class PaymentDetailPage {
  private readonly api = inject(DashboardApi);

  readonly id = input.required<string>();

  protected readonly detail = signal<PaymentIntentDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly loadProblem = signal<AppProblem | null>(null);
  protected readonly actionProblem = signal<AppProblem | null>(null);
  protected readonly panel = signal<Panel>('none');
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);

  protected readonly refundAmount = signal('');
  protected readonly refundReason = signal<RefundReason | ''>('');
  protected readonly refundError = signal<string | null>(null);
  protected readonly cancelReason = signal<CancellationReason | ''>('');

  protected readonly statusLabels = STATUS_LABELS_ES;
  protected readonly statusTones = STATUS_TONES;
  protected readonly methodLabels = METHOD_LABELS_ES;
  protected readonly eventLabels = EVENT_LABELS_ES;
  protected readonly deliveryLabels = DELIVERY_STATUS_LABELS_ES;
  protected readonly deliveryTones = DELIVERY_TONES;
  protected readonly refundReasons = Object.entries(REFUND_REASON_LABELS) as [
    RefundReason,
    string,
  ][];
  protected readonly cancelReasons = Object.entries(CANCELLATION_REASON_LABELS) as [
    CancellationReason,
    string,
  ][];
  protected readonly refundReasonLabels: Record<string, string> = REFUND_REASON_LABELS;
  protected readonly cancelReasonLabels: Record<string, string> = CANCELLATION_REASON_LABELS;
  protected readonly methodSummary = methodSummary;

  protected readonly pi = computed(() => this.detail()?.payment_intent ?? null);
  protected readonly refundable = computed(() => {
    const pi = this.pi();
    return pi ? pi.amount - pi.amount_refunded : 0;
  });
  protected readonly canRefund = computed(() => {
    const pi = this.pi();
    return !!pi && canRefund(pi.status, pi.amount, pi.amount_refunded);
  });
  protected readonly canCancel = computed(() => {
    const pi = this.pi();
    return !!pi && canCancel(pi.status);
  });
  protected readonly link = computed(() => {
    const pi = this.pi();
    return pi ? checkoutUrl(pi.id, pi.client_secret) : '';
  });
  protected readonly declineMessage = computed(() => {
    const error = this.pi()?.last_payment_error;
    return error ? (DECLINES[error.decline_code as DeclineCode]?.messageEs ?? error.message) : null;
  });

  private readonly refundKeys = new IdempotencyKeyTracker();

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected load(id = this.id()): void {
    this.loadProblem.set(null);
    this.api.payment(id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.notFound.set(false);
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        if (problem.status === 404) this.notFound.set(true);
        else this.loadProblem.set(problem);
      },
    });
  }

  protected open(panel: Panel): void {
    this.panel.set(panel);
    this.actionProblem.set(null);
    this.notice.set(null);
    this.refundError.set(null);
    if (panel === 'refund') this.refundAmount.set(minorToInput(this.refundable()));
  }

  protected refund(): void {
    const pi = this.pi();
    if (!pi || this.busy()) return;
    const amount = parseCopInput(this.refundAmount());
    if (amount === null || amount <= 0) {
      this.refundError.set('Ingresa un monto válido en pesos.');
      return;
    }
    if (amount > this.refundable()) {
      this.refundError.set(`El máximo reembolsable es ${formatCop(this.refundable())}.`);
      return;
    }
    this.refundError.set(null);
    const body = {
      ...(amount === this.refundable() ? {} : { amount }),
      ...(this.refundReason() ? { reason: this.refundReason() as RefundReason } : {}),
    };
    this.busy.set(true);
    this.actionProblem.set(null);
    this.api.refund(pi.id, body, this.refundKeys.keyFor({ id: pi.id, ...body, amount })).subscribe({
      next: (refund) => {
        this.refundKeys.reset();
        this.busy.set(false);
        this.panel.set('none');
        this.notice.set(`Reembolso de ${formatCop(refund.amount)} creado.`);
        this.load();
      },
      error: (error: unknown) => {
        this.actionProblem.set(toProblem(error));
        this.busy.set(false);
      },
    });
  }

  protected cancel(): void {
    const pi = this.pi();
    if (!pi || this.busy()) return;
    this.busy.set(true);
    this.actionProblem.set(null);
    this.api.cancelPayment(pi.id, this.cancelReason() || undefined).subscribe({
      next: () => {
        this.busy.set(false);
        this.panel.set('none');
        this.notice.set('Pago cancelado.');
        this.load();
      },
      error: (error: unknown) => {
        this.actionProblem.set(toProblem(error));
        this.busy.set(false);
        this.load();
      },
    });
  }

  protected reasonValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
