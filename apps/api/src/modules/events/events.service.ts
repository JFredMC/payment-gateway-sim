import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { newId } from '../../common/ids/public-id';
import type { EventType } from '../../domain/events';
import { GatewayEvent } from './entities/event.entity';

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
}
