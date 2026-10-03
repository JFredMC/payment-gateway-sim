import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { NextAction } from '../../core/api/api.models';
import { BRANDS, type CardBrand } from '../../domain/cards';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { IconComponent } from '../../shared/ui/icon.component';

/**
 * Simulated customer action: a 3-D Secure challenge from the card issuer, the
 * PSE bank portal, or the Nequi push approval. The buyer decides the outcome.
 */
@Component({
  selector: 'app-challenge',
  imports: [CopPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="challenge"
      [class.challenge-3ds]="action().type === 'three_d_secure'"
      [class.challenge-pse]="action().type === 'pse_redirect'"
      [class.challenge-nequi]="action().type === 'nequi_push'"
      role="region"
      [attr.aria-label]="title()"
      data-testid="challenge"
    >
      <header class="challenge-head">
        <app-icon [name]="icon()" [size]="20" />
        <div>
          <p class="challenge-kicker">{{ kicker() }}</p>
          <h2>{{ title() }}</h2>
        </div>
      </header>

      @switch (action().type) {
        @case ('three_d_secure') {
          <p>
            Tu banco necesita confirmar esta compra de <strong>{{ amount() | cop }}</strong> en
            <strong>{{ merchant() }}</strong> con tu tarjeta {{ cardLabel() }}.
          </p>
          <p class="small muted">
            En un pago real aquí ingresarías un código enviado por tu banco. En esta simulación
            eliges el resultado.
          </p>
        }
        @case ('pse_redirect') {
          <p>
            Estás en el portal PSE de <strong>{{ bankName() }}</strong
            >. Pago a <strong>{{ merchant() }}</strong> por <strong>{{ amount() | cop }}</strong
            >.
          </p>
          <p class="small muted">
            Banco ficticio: no se debita ninguna cuenta. Elige si apruebas o rechazas el débito.
          </p>
        }
        @case ('nequi_push') {
          <p>
            Enviamos una notificación a tu app Nequi ({{ phone() }}). Acepta el pago de
            <strong>{{ amount() | cop }}</strong> a <strong>{{ merchant() }}</strong
            >.
          </p>
          <p class="small muted">Simulación: ninguna notificación llega a tu celular.</p>
        }
      }

      <div class="challenge-actions">
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="busy()"
          (click)="decide.emit('approve')"
        >
          <app-icon name="check" [size]="16" /> {{ approveLabel() }}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          [disabled]="busy()"
          (click)="decide.emit('reject')"
        >
          <app-icon name="x" [size]="16" /> {{ rejectLabel() }}
        </button>
      </div>
    </section>
  `,
  styles: `
    .challenge {
      display: grid;
      gap: 0.85rem;
      padding: 1.25rem;
      border-radius: var(--radius);
      border: 1px solid var(--c-border);
      background: var(--c-surface-2);
    }
    .challenge-3ds {
      border-color: #c7d2fe;
      background: #eef2ff;
    }
    .challenge-pse {
      border-color: #bae6fd;
      background: #f0f9ff;
    }
    .challenge-nequi {
      border-color: #f5d0fe;
      background: #fdf4ff;
    }
    .challenge-head {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .challenge-head h2 {
      margin: 0;
      font-size: 1.1rem;
    }
    .challenge-kicker {
      margin: 0;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--c-muted);
    }
    p {
      margin: 0;
    }
    .challenge-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .challenge-actions .btn {
      flex: 1 1 10rem;
    }
  `,
})
export class ChallengeComponent {
  readonly action = input.required<NextAction>();
  readonly amount = input.required<number>();
  readonly merchant = input.required<string>();
  readonly busy = input(false);
  readonly decide = output<'approve' | 'reject'>();

  protected readonly icon = computed(() => {
    switch (this.action().type) {
      case 'three_d_secure':
        return 'shield' as const;
      case 'pse_redirect':
        return 'bank' as const;
      case 'nequi_push':
        return 'phone' as const;
    }
  });

  protected readonly kicker = computed(() => {
    switch (this.action().type) {
      case 'three_d_secure':
        return 'Banco emisor · simulado';
      case 'pse_redirect':
        return 'PSE · simulado';
      case 'nequi_push':
        return 'Nequi · simulado';
    }
  });

  protected readonly title = computed(() => {
    switch (this.action().type) {
      case 'three_d_secure':
        return 'Autenticación 3D Secure';
      case 'pse_redirect':
        return 'Confirma el pago en tu banco';
      case 'nequi_push':
        return 'Acepta el pago en Nequi';
    }
  });

  protected readonly approveLabel = computed(() =>
    this.action().type === 'three_d_secure' ? 'Autorizar pago' : 'Aprobar pago',
  );
  protected readonly rejectLabel = computed(() =>
    this.action().type === 'three_d_secure' ? 'Rechazar autenticación' : 'Rechazar pago',
  );

  protected readonly cardLabel = computed(() => {
    const action = this.action();
    if (action.type !== 'three_d_secure') return '';
    const brand = BRANDS[action.three_d_secure.brand as CardBrand]?.label ?? 'tarjeta';
    return `${brand} •••• ${action.three_d_secure.last4}`;
  });
  protected readonly bankName = computed(() => {
    const action = this.action();
    return action.type === 'pse_redirect' ? action.pse_redirect.bank_name : '';
  });
  protected readonly phone = computed(() => {
    const action = this.action();
    return action.type === 'nequi_push' ? action.nequi_push.phone : '';
  });
}
