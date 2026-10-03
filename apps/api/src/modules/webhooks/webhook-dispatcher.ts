import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Env } from '../../config/env.schema';
import {
  isAcknowledged,
  retryDelaySeconds,
  SIGNATURE_HEADER,
  webhookUrlProblem,
  type WebhookErrorCode,
} from '../../domain/webhooks';
import { toEventJson } from '../events/event.dto';
import { isPublicHost } from './address-guard';
import { type DeliveryAttempt, WebhookDelivery } from './entities/webhook-delivery.entity';
import { signatureHeader } from './webhook-signature';

/** A claimed delivery is invisible to other workers for this long (crash recovery). */
const LEASE_SECONDS = 60;
const BATCH_SIZE = 10;
const RESPONSE_EXCERPT = 500;
const MAX_LOGGED_ATTEMPTS = 20;

interface AttemptOutcome {
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: WebhookErrorCode | null;
  durationMs: number;
  /** No point retrying (endpoint disabled, invalid URL). */
  terminal: boolean;
}

/**
 * Delivery worker. Polls the queue, claims due deliveries with
 * `FOR UPDATE SKIP LOCKED` (safe with several API replicas), POSTs the signed
 * event and schedules retries with exponential backoff.
 */
@Injectable()
export class WebhookDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(WebhookDelivery) private readonly repo: Repository<WebhookDelivery>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('WEBHOOK_WORKER_ENABLED', { infer: true })) return;
    const interval = this.config.get('WEBHOOK_POLL_INTERVAL_MS', { infer: true });
    this.timer = setInterval(() => this.tick(), interval);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  private tick(): void {
    if (this.running) return;
    this.running = this.runOnce()
      .catch((error: unknown) => this.logger.error('Webhook dispatch failed', error as Error))
      .finally(() => (this.running = null));
  }

  /** Claims and delivers one batch of due deliveries. Returns how many were attempted. */
  async runOnce(limit = BATCH_SIZE): Promise<number> {
    const result: unknown = await this.dataSource.query(
      `UPDATE webhook_deliveries
          SET next_attempt_at = now() + make_interval(secs => $2)
        WHERE id IN (
          SELECT id FROM webhook_deliveries
           WHERE status = 'pending' AND next_attempt_at <= now()
           ORDER BY next_attempt_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED)
      RETURNING id`,
      [limit, LEASE_SECONDS],
    );
    // TypeORM returns [rows, affectedCount] for UPDATE statements on Postgres.
    const rows = (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result) as {
      id: string;
    }[];
    await Promise.allSettled(rows.map(({ id }) => this.attempt(id, false)));
    return rows.length;
  }

  /** One HTTP attempt for a delivery, then its new state is persisted. */
  async attempt(id: string, manual: boolean): Promise<WebhookDelivery> {
    const delivery = await this.repo.findOneOrFail({
      where: { id },
      relations: { endpoint: true, event: true },
    });
    const outcome = await this.send(delivery);
    const now = new Date();
    const attempts = delivery.attempts + 1;

    const entry: DeliveryAttempt = {
      attempt: attempts,
      at: now.toISOString(),
      response_status: outcome.responseStatus,
      duration_ms: outcome.durationMs,
      error_code: outcome.errorCode,
      manual,
    };
    delivery.attempts = attempts;
    delivery.lastAttemptAt = now;
    delivery.responseStatus = outcome.responseStatus;
    delivery.responseBody = outcome.responseBody;
    delivery.errorCode = outcome.errorCode;
    delivery.durationMs = outcome.durationMs;
    delivery.attemptLog = [...delivery.attemptLog, entry].slice(-MAX_LOGGED_ATTEMPTS);

    if (outcome.errorCode === null) {
      delivery.status = 'succeeded';
      delivery.deliveredAt = now;
      delivery.nextAttemptAt = null;
    } else {
      const delay = outcome.terminal
        ? null
        : retryDelaySeconds(
            attempts,
            this.config.get('WEBHOOK_RETRY_BASE_SECONDS', { infer: true }),
          );
      if (delay === null) {
        // A manual retry of an already delivered event never "un-delivers" it.
        delivery.status = delivery.deliveredAt ? 'succeeded' : 'failed';
        delivery.nextAttemptAt = null;
      } else {
        delivery.status = delivery.deliveredAt ? 'succeeded' : 'pending';
        delivery.nextAttemptAt = delivery.deliveredAt
          ? null
          : new Date(now.getTime() + delay * 1000);
      }
    }
    return this.repo.save(delivery);
  }

  private async send(delivery: WebhookDelivery): Promise<AttemptOutcome> {
    const endpoint = delivery.endpoint;
    const event = delivery.event;
    const started = Date.now();
    const fail = (
      errorCode: WebhookErrorCode,
      terminal = false,
      responseStatus: number | null = null,
    ) => ({
      responseStatus,
      responseBody: null,
      errorCode,
      durationMs: Date.now() - started,
      terminal,
    });

    if (!endpoint || !event || endpoint.status !== 'enabled')
      return fail('endpoint_disabled', true);
    const allowInsecure = this.config.get('WEBHOOK_ALLOW_INSECURE_URLS', { infer: true });
    if (webhookUrlProblem(endpoint.url, allowInsecure)) return fail('invalid_url', true);
    const url = new URL(endpoint.url);
    if (!allowInsecure && !(await isPublicHost(url.hostname))) return fail('blocked_address');

    const body = JSON.stringify(toEventJson(event));
    try {
      const response = await fetch(url, {
        method: 'POST',
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.get('WEBHOOK_TIMEOUT_MS', { infer: true })),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Pasarela-Webhooks/1.0 (+https://github.com/JFredMC/payment-gateway-sim)',
          [SIGNATURE_HEADER]: signatureHeader(endpoint.secret, body),
          'Pasarela-Event-Id': event.id,
          'Pasarela-Delivery-Id': delivery.id,
        },
      });
      const responseBody = await readExcerpt(response);
      const ok = isAcknowledged(response.status);
      return {
        responseStatus: response.status,
        responseBody,
        errorCode: ok ? null : 'http_status',
        durationMs: Date.now() - started,
        terminal: false,
      };
    } catch (error) {
      const name = (error as Error).name;
      return fail(
        name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'connection_error',
      );
    }
  }
}

/** First bytes of the response, without buffering a huge body. */
async function readExcerpt(response: Response): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.length < RESPONSE_EXCERPT) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    // The excerpt is best-effort.
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  return text ? text.slice(0, RESPONSE_EXCERPT) : null;
}
