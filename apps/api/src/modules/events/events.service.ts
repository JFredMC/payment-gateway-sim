import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { newId } from '../../common/ids/public-id';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import type { EventType } from '../../domain/events';
import { GatewayEvent } from './entities/event.entity';
import { type EventJson, toEventJson } from './event.dto';

export interface ListEventsQuery {
  limit?: number;
  cursor?: string;
  type?: EventType;
  payment_intent?: string;
}

export interface EventList {
  object: 'list';
  data: EventJson[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface RecordEventInput {
  merchantId: string;
  type: EventType;
  paymentIntentId: string | null;
  data: Record<string, unknown>;
}

/** Hook run in the same transaction as the event (webhook fan-out). */
export type EventListener = (manager: EntityManager, event: GatewayEvent) => Promise<void>;

@Injectable()
export class EventsService {
  private readonly listeners: EventListener[] = [];

  constructor(@InjectRepository(GatewayEvent) private readonly repo: Repository<GatewayEvent>) {}

  /** Registers a listener that runs inside the recording transaction. */
  subscribe(listener: EventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Records an event in the caller's transaction: it commits (or rolls back)
   * atomically with the state change it describes (transactional outbox).
   */
  async record(manager: EntityManager, input: RecordEventInput): Promise<GatewayEvent> {
    const repo = manager.getRepository(GatewayEvent);
    const event = await repo.save(
      repo.create({
        id: newId('evt'),
        merchantId: input.merchantId,
        type: input.type,
        paymentIntentId: input.paymentIntentId,
        data: input.data,
      }),
    );
    for (const listener of this.listeners) await listener(manager, event);
    return event;
  }

  /** Newest first. With `payment_intent`, this is the payment's timeline. */
  async list(merchantId: string, query: ListEventsQuery): Promise<EventList> {
    const limit = query.limit ?? 20;
    const qb = this.repo
      .createQueryBuilder('e')
      .where('e.merchant_id = :merchantId', { merchantId })
      .orderBy('e.created_at', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .limit(limit + 1);
    if (query.type) qb.andWhere('e.type = :type', { type: query.type });
    if (query.payment_intent) {
      qb.andWhere('e.payment_intent_id = :pi', { pi: query.payment_intent });
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      qb.andWhere('(e.created_at, e.id) < (:createdAt::timestamptz, :id)', cursor);
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      object: 'list',
      data: page.map(toEventJson),
      has_more: rows.length > limit,
      next_cursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(merchantId: string, id: string): Promise<EventJson> {
    const event = await this.repo.findOne({ where: { id, merchantId } });
    if (!event) throw new DomainError('NOT_FOUND', `No such event: ${id}`);
    return toEventJson(event);
  }
}
