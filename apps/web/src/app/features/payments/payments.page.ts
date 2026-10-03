import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { PaymentIntent } from '../../core/api/api.models';
import { DashboardApi } from '../../core/api/dashboard-api.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import {
  PAYMENT_INTENT_STATUSES,
  type PaymentIntentStatus,
  STATUS_LABELS_ES,
} from '../../domain/payment-intent-state';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { DateTimePipe } from '../../shared/pipes/date-time.pipe';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { methodSummary, STATUS_TONES } from '../../shared/utils/payments';

const FILTERS: { value: PaymentIntentStatus | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'succeeded', label: 'Exitosos' },
  { value: 'requires_payment_method', label: 'Pendientes' },
  { value: 'requires_action', label: 'Requieren acción' },
  { value: 'failed', label: 'Fallidos' },
  { value: 'canceled', label: 'Cancelados' },
];

/** `/pagos?estado=succeeded`: payments with a status filter and cursor pagination. */
@Component({
  selector: 'app-payments-page',
  imports: [
    RouterLink,
    CopPipe,
    DateTimePipe,
    BadgeComponent,
    IconComponent,
    ProblemAlertComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payments.page.html',
  styleUrl: './payments.page.scss',
})
export class PaymentsPage {
  private readonly api = inject(DashboardApi);
  private readonly router = inject(Router);

  /** Query string filter (`?estado=`), so a filtered list survives reloads and links. */
  readonly estado = input<string>();

  protected readonly filters = FILTERS;
  protected readonly statusLabels = STATUS_LABELS_ES;
  protected readonly statusTones = STATUS_TONES;
  protected readonly methodSummary = methodSummary;

  protected readonly items = signal<PaymentIntent[] | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly problem = signal<AppProblem | null>(null);
  protected readonly status = signal<PaymentIntentStatus | null>(null);

  constructor() {
    effect(() => {
      const raw = this.estado();
      const status = PAYMENT_INTENT_STATUSES.includes(raw as PaymentIntentStatus)
        ? (raw as PaymentIntentStatus)
        : null;
      untracked(() => {
        this.status.set(status);
        this.reload();
      });
    });
  }

  protected select(status: PaymentIntentStatus | null): void {
    void this.router.navigate([], { queryParams: { estado: status ?? null }, replaceUrl: true });
  }

  protected reload(): void {
    this.items.set(null);
    this.problem.set(null);
    this.api.payments({ status: this.status(), limit: 20 }).subscribe({
      next: (page) => {
        this.items.set(page.data);
        this.nextCursor.set(page.next_cursor);
      },
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.items.set([]);
      },
    });
  }

  protected more(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.api.payments({ status: this.status(), cursor, limit: 20 }).subscribe({
      next: (page) => {
        this.items.update((items) => [...(items ?? []), ...page.data]);
        this.nextCursor.set(page.next_cursor);
        this.loadingMore.set(false);
      },
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.loadingMore.set(false);
      },
    });
  }
}
