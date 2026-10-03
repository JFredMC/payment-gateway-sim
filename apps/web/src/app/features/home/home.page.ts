import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/** Dashboard home (KPIs arrive with the dashboard module). */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      <header class="page-header">
        <h1>Hola, {{ auth.firstName() }}</h1>
        <p class="muted">Este es el panel de tu comercio en modo test.</p>
      </header>
      @if (auth.user(); as user) {
        <section class="card stack" aria-labelledby="merchant-title">
          <h2 id="merchant-title" class="card-title">Tu comercio</h2>
          <p data-testid="business-name">
            <strong>{{ user.merchant.business_name }}</strong>
          </p>
          <p class="small muted">
            ID de cuenta: <span class="mono">{{ user.merchant.id }}</span>
          </p>
        </section>
      }
    </div>
  `,
})
export class HomePage {
  protected readonly auth = inject(AuthService);
}
