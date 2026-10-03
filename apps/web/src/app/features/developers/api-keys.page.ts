import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ApiKey } from '../../core/api/api.models';
import { DashboardApi } from '../../core/api/dashboard-api.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { DateTimePipe } from '../../shared/pipes/date-time.pipe';
import { CopyButtonComponent } from '../../shared/ui/copy-button.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';

/** `/desarrolladores/claves`: publishable and secret test keys. */
@Component({
  selector: 'app-api-keys-page',
  imports: [RouterLink, DateTimePipe, CopyButtonComponent, IconComponent, ProblemAlertComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './api-keys.page.html',
  styleUrl: './developers.scss',
})
export class ApiKeysPage {
  private readonly api = inject(DashboardApi);

  protected readonly keys = signal<ApiKey[] | null>(null);
  protected readonly problem = signal<AppProblem | null>(null);
  protected readonly confirming = signal(false);
  protected readonly rolling = signal(false);
  /** The new secret key: shown once, right after rolling. */
  protected readonly revealed = signal<string | null>(null);

  protected readonly publishable = computed(() =>
    this.keys()?.find((k) => k.type === 'publishable'),
  );
  protected readonly secret = computed(() => this.keys()?.find((k) => k.type === 'secret'));
  protected readonly apiBase = new URL('api/v1', document.baseURI).href;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.problem.set(null);
    this.api.apiKeys().subscribe({
      next: (keys) => this.keys.set(keys),
      error: (error: unknown) => this.problem.set(toProblem(error)),
    });
  }

  protected roll(): void {
    this.rolling.set(true);
    this.problem.set(null);
    this.api.rollKey('secret').subscribe({
      next: (key) => {
        this.revealed.set(key.secret ?? null);
        this.confirming.set(false);
        this.rolling.set(false);
        this.load();
      },
      error: (error: unknown) => {
        this.problem.set(toProblem(error));
        this.rolling.set(false);
      },
    });
  }
}
