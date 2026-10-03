import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { newId } from '../../common/ids/public-id';
import type { Env } from '../../config/env.schema';
import { ALL_EVENTS, webhookUrlProblem } from '../../domain/webhooks';
import type {
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
} from './dto/webhook-endpoint.dto';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { toWebhookEndpointJson, type WebhookEndpointJson } from './serializers';
import { generateWebhookSecret } from './webhook-signature';

/** Keeps a public demo from turning into a request amplifier. */
export const MAX_ENDPOINTS_PER_MERCHANT = 5;

@Injectable()
export class WebhookEndpointsService {
  constructor(
    @InjectRepository(WebhookEndpoint) private readonly repo: Repository<WebhookEndpoint>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(merchantId: string): Promise<WebhookEndpointJson[]> {
    const rows = await this.repo.find({ where: { merchantId }, order: { createdAt: 'ASC' } });
    return rows.map(toWebhookEndpointJson);
  }

  async get(merchantId: string, id: string): Promise<WebhookEndpointJson> {
    return toWebhookEndpointJson(await this.find(merchantId, id));
  }

  async create(merchantId: string, dto: CreateWebhookEndpointDto): Promise<WebhookEndpointJson> {
    this.assertUrl(dto.url);
    const count = await this.repo.count({ where: { merchantId } });
    if (count >= MAX_ENDPOINTS_PER_MERCHANT) {
      throw new DomainError(
        'WEBHOOK_ENDPOINT_LIMIT',
        `A merchant can have at most ${MAX_ENDPOINTS_PER_MERCHANT} webhook endpoints.`,
        { limit: MAX_ENDPOINTS_PER_MERCHANT },
      );
    }
    const endpoint = await this.repo.save(
      this.repo.create({
        id: newId('we'),
        merchantId,
        url: dto.url,
        description: dto.description?.trim() || null,
        enabledEvents: normalizeEvents(dto.enabled_events),
        secret: generateWebhookSecret(),
        status: 'enabled',
      }),
    );
    return toWebhookEndpointJson(endpoint);
  }

  async update(
    merchantId: string,
    id: string,
    dto: UpdateWebhookEndpointDto,
  ): Promise<WebhookEndpointJson> {
    const endpoint = await this.find(merchantId, id);
    if (dto.url !== undefined) {
      this.assertUrl(dto.url);
      endpoint.url = dto.url;
    }
    if (dto.description !== undefined) endpoint.description = dto.description.trim() || null;
    if (dto.enabled_events !== undefined)
      endpoint.enabledEvents = normalizeEvents(dto.enabled_events);
    if (dto.status !== undefined) endpoint.status = dto.status;
    return toWebhookEndpointJson(await this.repo.save(endpoint));
  }

  async rollSecret(merchantId: string, id: string): Promise<WebhookEndpointJson> {
    const endpoint = await this.find(merchantId, id);
    endpoint.secret = generateWebhookSecret();
    return toWebhookEndpointJson(await this.repo.save(endpoint));
  }

  async remove(merchantId: string, id: string): Promise<void> {
    const endpoint = await this.find(merchantId, id);
    await this.repo.remove(endpoint);
  }

  private async find(merchantId: string, id: string): Promise<WebhookEndpoint> {
    const endpoint = await this.repo.findOne({ where: { id, merchantId } });
    if (!endpoint) throw new DomainError('NOT_FOUND', `No such webhook_endpoint: ${id}`);
    return endpoint;
  }

  private assertUrl(url: string): void {
    const reason = webhookUrlProblem(
      url,
      this.config.get('WEBHOOK_ALLOW_INSECURE_URLS', { infer: true }),
    );
    if (reason) {
      throw new DomainError(
        'INVALID_WEBHOOK_URL',
        `The webhook URL is not acceptable: ${reason}.`,
        {
          reason,
        },
      );
    }
  }
}

/** `*` wins over a list; otherwise the explicit types, in a stable order. */
function normalizeEvents(events: string[]): string[] {
  return events.includes(ALL_EVENTS) ? [ALL_EVENTS] : [...events].sort();
}
