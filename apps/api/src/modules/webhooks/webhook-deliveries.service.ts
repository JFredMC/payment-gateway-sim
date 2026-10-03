import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { newId } from '../../common/ids/public-id';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { listensTo } from '../../domain/webhooks';
import type { GatewayEvent } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import type { ListJson } from '../payments/serializers';
import type { ListWebhookDeliveriesQueryDto } from './dto/webhook-endpoint.dto';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { toWebhookDeliveryJson, type WebhookDeliveryJson } from './serializers';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class WebhookDeliveriesService implements OnModuleInit {
  constructor(
    @InjectRepository(WebhookDelivery) private readonly repo: Repository<WebhookDelivery>,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe((manager, event) => this.enqueue(manager, event));
  }

  /**
   * Outbox: runs inside the transaction that records the event, so a delivery
   * exists if and only if the state change committed.
   */
  async enqueue(manager: EntityManager, event: GatewayEvent): Promise<void> {
    const endpoints = await manager
      .getRepository(WebhookEndpoint)
      .find({ where: { merchantId: event.merchantId, status: 'enabled' } });
    const targets = endpoints.filter((endpoint) => listensTo(endpoint.enabledEvents, event.type));
    if (targets.length === 0) return;
    await manager.getRepository(WebhookDelivery).insert(
      targets.map((endpoint) => ({
        id: newId('whdel'),
        merchantId: event.merchantId,
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: event.type,
        status: 'pending' as const,
        nextAttemptAt: new Date(),
        attemptLog: [],
      })),
    );
  }

  async list(
    merchantId: string,
    query: ListWebhookDeliveriesQueryDto,
  ): Promise<ListJson<WebhookDeliveryJson>> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const qb = this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.endpoint', 'we')
      .leftJoinAndSelect('d.event', 'evt')
      .where('d.merchant_id = :merchantId', { merchantId })
      .orderBy('d.created_at', 'DESC')
      .addOrderBy('d.id', 'DESC')
      .limit(limit + 1); // many-to-one joins: no row fan-out
    if (query.endpoint) qb.andWhere('d.endpoint_id = :endpoint', { endpoint: query.endpoint });
    if (query.event) qb.andWhere('d.event_id = :event', { event: query.event });
    if (query.status) qb.andWhere('d.status = :status', { status: query.status });
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      qb.andWhere('(d.created_at, d.id) < (:createdAt::timestamptz, :id)', cursor);
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      object: 'list',
      data: page.map((row) => toWebhookDeliveryJson(row)),
      has_more: rows.length > limit,
      next_cursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  /** Deliveries of every event of one payment intent (dashboard detail page). */
  async listForPaymentIntent(
    merchantId: string,
    paymentIntentId: string,
  ): Promise<WebhookDeliveryJson[]> {
    const rows = await this.repo
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.event', 'evt')
      .leftJoinAndSelect('d.endpoint', 'we')
      .where('d.merchant_id = :merchantId', { merchantId })
      .andWhere('evt.payment_intent_id = :paymentIntentId', { paymentIntentId })
      .orderBy('d.created_at', 'ASC')
      .addOrderBy('d.id', 'ASC')
      .limit(100)
      .getMany();
    return rows.map((row) => toWebhookDeliveryJson(row));
  }

  async get(merchantId: string, id: string): Promise<WebhookDeliveryJson> {
    return toWebhookDeliveryJson(await this.find(merchantId, id), true);
  }

  async find(merchantId: string, id: string): Promise<WebhookDelivery> {
    const delivery = await this.repo.findOne({
      where: { id, merchantId },
      relations: { endpoint: true, event: true },
    });
    if (!delivery) throw new DomainError('NOT_FOUND', `No such webhook_delivery: ${id}`);
    return delivery;
  }
}
