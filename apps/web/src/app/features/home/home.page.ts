import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { DashboardSummary, PaymentIntent } from '../../core/api/api.models';
import { DashboardApi } from '../../core/api/dashboard-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { METHOD_LABELS_ES, STATUS_LABELS_ES } from '../../domain/payment-intent-state';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { DateTimePipe } from '../../shared/pipes/date-time.pipe';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { formatCop } from '../../shared/utils/money';
import { methodSummary, STATUS_TONES } from '../../shared/utils/payments';

const shortDay = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const weekdayDay = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const dayOfMonth = new Intl.DateTimeFormat('es-CO', { day: 'numeric', timeZone: 'UTC' });

/** Dashboard home: KPIs in COP, daily volume and the latest payments. */
@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
    CopPipe,
    DateTimePipe,
    BadgeComponent,
    IconComponent,
    ProblemAlertComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(DashboardApi);

  protected readonly days = signal<7 | 30>(7);
  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly recent = signal<PaymentIntent[] | null>(null);
  protected readonly problem = signal<AppProblem | null>(null);

  protected readonly statusLabels = STATUS_LABELS_ES;
  protected readonly statusTones = STATUS_TONES;
  protected readonly methodLabels = METHOD_LABELS_ES;
  protected readonly methodSummary = methodSummary;

  protected readonly approval = computed(() => {
    const rate = this.summary()?.approval_rate;
    return rate === null || rate === undefined
      ? '—'
      : `${(rate * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
  });

  /** Bars of the daily volume chart (heights in % of the best day). */
  protected readonly bars = computed(() => {
    const daily = this.summary()?.daily ?? [];
    const max = Math.max(1, ...daily.map((d) => d.volume));
    const labelEvery = daily.length > 10 ? 5 : 1;
    return daily.map((d, index) => ({
      ...d,
      height: d.volume === 0 ? 0 : Math.max(3, Math.round((d.volume / max) * 100)),
      label: (daily.length > 10 ? dayOfMonth : weekdayDay).format(new Date(`${d.date}T00:00:00Z`)),
      showLabel: index % labelEvery === 0 || index === daily.length - 1,
      title: `${shortDay.format(new Date(`${d.date}T00:00:00Z`))}: ${formatCop(d.volume)} (${d.count} ${d.count === 1 ? 'pago' : 'pagos'})`,
    }));
  });

  protected readonly methodShare = computed(() => {
    const summary = this.summary();
    if (!summary || summary.gross_volume === 0) return [];
    return summary.by_method.map((m) => ({
      ...m,
      share: Math.round((m.volume / summary.gross_volume) * 100),
    }));
  });

  constructor() {
    this.load();
  }

  protected setDays(days: 7 | 30): void {
    if (days === this.days()) return;
    this.days.set(days);
    this.load();
  }

  protected load(): void {
    this.problem.set(null);
    forkJoin({
      summary: this.api.summary(this.days()),
      recent: this.api.payments({ limit: 5 }),
    }).subscribe({
      next: ({ summary, recent }) => {
        this.summary.set(summary);
        this.recent.set(recent.data);
      },
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.recent.set(this.recent() ?? []);
      },
    });
  }
}
