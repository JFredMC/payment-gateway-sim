import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

type ApiStatus = 'checking' | 'up' | 'down';

/** Scaffold landing page: shows whether the API (and its database) answers. */
@Component({
  selector: 'app-status-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-narrow">
      <div class="card stack">
        <h1>Pasarela de pagos simulada</h1>
        <p class="muted">
          Payment intents, checkout alojado y webhooks firmados en modo test. Sin dinero real.
        </p>
        <p role="status" data-testid="api-status">
          @switch (status()) {
            @case ('checking') {
              Verificando la API…
            }
            @case ('up') {
              API disponible · base de datos conectada
            }
            @case ('down') {
              La API no responde
            }
          }
        </p>
      </div>
    </div>
  `,
})
export class StatusPage {
  private readonly http = inject(HttpClient);
  protected readonly status = signal<ApiStatus>('checking');

  constructor() {
    this.http.get<{ status: string }>('/api/v1/health').subscribe({
      next: (res) => this.status.set(res.status === 'ok' ? 'up' : 'down'),
      error: () => this.status.set('down'),
    });
  }
}
