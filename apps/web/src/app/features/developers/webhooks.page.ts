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
import { Router, RouterLink } from '@angular/router';
import type { WebhookDelivery, WebhookEndpoint } from '../../core/api/api.models';
import { DashboardApi } from '../../core/api/dashboard-api.service';
import { type AppProblem, toProblem } from '../../core/http/problem';
import { EVENT_LABELS_ES, EVENT_TYPES, type EventType } from '../../domain/events';
import {
  ALL_EVENTS,
  DELIVERY_STATUS_LABELS_ES,
  SIGNATURE_HEADER,
  WEBHOOK_ERROR_LABELS_ES,
  type WebhookDeliveryStatus,
  webhookUrlProblem,
} from '../../domain/webhooks';
import { DateTimePipe } from '../../shared/pipes/date-time.pipe';
import { BadgeComponent } from '../../shared/ui/badge.component';
import { CopyButtonComponent } from '../../shared/ui/copy-button.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProblemAlertComponent } from '../../shared/ui/problem-alert.component';
import { DELIVERY_TONES } from '../../shared/utils/payments';

const URL_PROBLEMS: Record<string, string> = {
  invalid_url: 'Ingresa una URL válida (https://…).',
  https_required: 'La URL debe usar https.',
  credentials_in_url: 'La URL no puede incluir usuario ni contraseña.',
};

const DELIVERY_FILTERS: { value: WebhookDeliveryStatus | null; label: string }[] = [
  { value: null, label: 'Todas' },
  { value: 'succeeded', label: 'Entregadas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'failed', label: 'Fallidas' },
];

/** `/desarrolladores/webhooks[?entrega=whdel_…]`: endpoints and the delivery log. */
@Component({
  selector: 'app-webhooks-page',
  imports: [
    RouterLink,
    DateTimePipe,
    BadgeComponent,
    CopyButtonComponent,
    IconComponent,
    ProblemAlertComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './webhooks.page.html',
  styleUrl: './developers.scss',
})
export class WebhooksPage {
  private readonly api = inject(DashboardApi);
  private readonly router = inject(Router);

  /** Deep link to one delivery (`?entrega=`). */
  readonly entrega = input<string>();

  protected readonly eventTypes = EVENT_TYPES;
  protected readonly eventLabels = EVENT_LABELS_ES;
  protected readonly deliveryLabels = DELIVERY_STATUS_LABELS_ES;
  protected readonly deliveryTones = DELIVERY_TONES;
  protected readonly errorLabels = WEBHOOK_ERROR_LABELS_ES;
  protected readonly deliveryFilters = DELIVERY_FILTERS;
  protected readonly signatureHeader = SIGNATURE_HEADER;

  protected readonly endpoints = signal<WebhookEndpoint[] | null>(null);
  protected readonly endpointsProblem = signal<AppProblem | null>(null);
  protected readonly revealedSecrets = signal<ReadonlySet<string>>(new Set());
  protected readonly confirm = signal<{ id: string; action: 'roll' | 'delete' } | null>(null);
  protected readonly busyEndpoint = signal<string | null>(null);

  // New endpoint form
  protected readonly showForm = signal(false);
  protected readonly url = signal('');
  protected readonly description = signal('');
  protected readonly allEvents = signal(true);
  protected readonly selectedEvents = signal<ReadonlySet<EventType>>(new Set());
  protected readonly formErrors = signal<{ url?: string; events?: string }>({});
  protected readonly formProblem = signal<AppProblem | null>(null);
  protected readonly creating = signal(false);

  // Deliveries
  protected readonly deliveryStatus = signal<WebhookDeliveryStatus | null>(null);
  protected readonly deliveries = signal<WebhookDelivery[] | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly deliveriesProblem = signal<AppProblem | null>(null);
  protected readonly expanded = signal<string | null>(null);
  protected readonly details = signal<Record<string, WebhookDelivery>>({});
  protected readonly retrying = signal<string | null>(null);
  /** A deep-linked delivery that is not on the first page of the log. */
  protected readonly pinned = signal<WebhookDelivery | null>(null);

  protected readonly visibleDeliveries = computed(() => {
    const list = this.deliveries() ?? [];
    const pinned = this.pinned();
    return pinned && !list.some((d) => d.id === pinned.id) ? [pinned, ...list] : list;
  });

  constructor() {
    this.loadEndpoints();
    effect(() => {
      const id = this.entrega();
      untracked(() => {
        if (id) this.expand(id, true);
        this.loadDeliveries();
      });
    });
  }

  // --- endpoints ---------------------------------------------------------------

  protected loadEndpoints(): void {
    this.endpointsProblem.set(null);
    this.api.webhookEndpoints().subscribe({
      next: (list) => this.endpoints.set(list),
      error: (error: unknown) => this.endpointsProblem.set(toProblem(error)),
    });
  }

  protected toggleEvent(type: EventType, checked: boolean): void {
    const next = new Set(this.selectedEvents());
    if (checked) next.add(type);
    else next.delete(type);
    this.selectedEvents.set(next);
  }

  protected create(): void {
    const url = this.url().trim();
    const urlProblem = webhookUrlProblem(url, true);
    const events = this.allEvents() ? [ALL_EVENTS] : [...this.selectedEvents()];
    const errors = {
      ...(urlProblem ? { url: URL_PROBLEMS[urlProblem] ?? URL_PROBLEMS['invalid_url'] } : {}),
      ...(events.length === 0 ? { events: 'Elige al menos un evento.' } : {}),
    };
    this.formErrors.set(errors);
    if (Object.keys(errors).length > 0) return;

    this.creating.set(true);
    this.formProblem.set(null);
    this.api
      .createWebhookEndpoint({
        url,
        enabled_events: events,
        ...(this.description().trim() ? { description: this.description().trim() } : {}),
      })
      .subscribe({
        next: (endpoint) => {
          this.endpoints.update((list) => [...(list ?? []), endpoint]);
          this.revealedSecrets.update((set) => new Set([...set, endpoint.id]));
          this.creating.set(false);
          this.showForm.set(false);
          this.url.set('');
          this.description.set('');
          this.allEvents.set(true);
          this.selectedEvents.set(new Set());
        },
        error: (error: unknown) => {
          this.formProblem.set(toProblem(error));
          this.creating.set(false);
        },
      });
  }

  protected toggleSecret(id: string): void {
    this.revealedSecrets.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected maskSecret(secret: string): string {
    return `whsec_${'•'.repeat(12)}${secret.slice(-4)}`;
  }

  protected eventsLabel(endpoint: WebhookEndpoint): string {
    return endpoint.enabled_events.includes(ALL_EVENTS)
      ? 'Todos los eventos'
      : endpoint.enabled_events.map((e) => this.eventLabels[e as EventType] ?? e).join(' · ');
  }

  protected setStatus(endpoint: WebhookEndpoint): void {
    this.mutate(endpoint.id, () =>
      this.api.updateWebhookEndpoint(endpoint.id, {
        status: endpoint.status === 'enabled' ? 'disabled' : 'enabled',
      }),
    );
  }

  protected rollSecret(id: string): void {
    this.mutate(id, () => this.api.rollWebhookSecret(id), true);
  }

  protected remove(id: string): void {
    this.busyEndpoint.set(id);
    this.api.deleteWebhookEndpoint(id).subscribe({
      next: () => {
        this.endpoints.update((list) => (list ?? []).filter((e) => e.id !== id));
        this.busyEndpoint.set(null);
        this.confirm.set(null);
        this.loadDeliveries();
      },
      error: (error: unknown) => {
        this.endpointsProblem.set(toProblem(error));
        this.busyEndpoint.set(null);
      },
    });
  }

  private mutate(
    id: string,
    call: () => ReturnType<DashboardApi['updateWebhookEndpoint']>,
    reveal = false,
  ): void {
    this.busyEndpoint.set(id);
    this.endpointsProblem.set(null);
    call().subscribe({
      next: (updated) => {
        this.endpoints.update((list) => (list ?? []).map((e) => (e.id === id ? updated : e)));
        if (reveal) this.revealedSecrets.update((set) => new Set([...set, id]));
        this.busyEndpoint.set(null);
        this.confirm.set(null);
      },
      error: (error: unknown) => {
        this.endpointsProblem.set(toProblem(error));
        this.busyEndpoint.set(null);
      },
    });
  }

  // --- deliveries --------------------------------------------------------------

  protected filterDeliveries(status: WebhookDeliveryStatus | null): void {
    this.deliveryStatus.set(status);
    this.loadDeliveries();
  }

  protected loadDeliveries(): void {
    this.deliveriesProblem.set(null);
    this.api.deliveries({ status: this.deliveryStatus(), limit: 20 }).subscribe({
      next: (page) => {
        this.deliveries.set(page.data);
        this.nextCursor.set(page.next_cursor);
      },
      error: (error: unknown) => {
        this.deliveriesProblem.set(toProblem(error));
        this.deliveries.set(this.deliveries() ?? []);
      },
    });
  }

  protected moreDeliveries(): void {
    const cursor = this.nextCursor();
    if (!cursor) return;
    this.api.deliveries({ status: this.deliveryStatus(), cursor, limit: 20 }).subscribe({
      next: (page) => {
        this.deliveries.update((list) => [...(list ?? []), ...page.data]);
        this.nextCursor.set(page.next_cursor);
      },
      error: (error: unknown) => this.deliveriesProblem.set(toProblem(error)),
    });
  }

  protected expand(id: string, fromLink = false): void {
    if (!fromLink && this.expanded() === id) {
      this.expanded.set(null);
      void this.router.navigate([], { queryParams: { entrega: null }, replaceUrl: true });
      return;
    }
    this.expanded.set(id);
    if (!fromLink) {
      void this.router.navigate([], { queryParams: { entrega: id }, replaceUrl: true });
    }
    this.api.delivery(id).subscribe({
      next: (delivery) => {
        this.details.update((map) => ({ ...map, [id]: delivery }));
        if (fromLink) this.pinned.set(delivery);
      },
      error: (error: unknown) => this.deliveriesProblem.set(toProblem(error)),
    });
  }

  protected retry(id: string): void {
    this.retrying.set(id);
    this.deliveriesProblem.set(null);
    this.api.retryDelivery(id).subscribe({
      next: (delivery) => {
        this.details.update((map) => ({ ...map, [id]: delivery }));
        this.deliveries.update((list) => (list ?? []).map((d) => (d.id === id ? delivery : d)));
        if (this.pinned()?.id === id) this.pinned.set(delivery);
        this.retrying.set(null);
      },
      error: (error: unknown) => {
        this.deliveriesProblem.set(toProblem(error));
        this.retrying.set(null);
      },
    });
  }

  protected pretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
}
