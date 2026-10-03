import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { newId } from '../../common/ids/public-id';
import { EventsService } from '../events/events.service';
import type { CreateRefundDto } from './dto/create-refund.dto';
import { PaymentIntent } from './entities/payment-intent.entity';
import { Refund } from './entities/refund.entity';
import { PaymentIntentsService } from './payment-intents.service';
import { type RefundJson, toPaymentIntentJson, toRefundJson } from './serializers';

@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund) private readonly repo: Repository<Refund>,
    private readonly intents: PaymentIntentsService,
    private readonly events: EventsService,
  ) {}

  /**
   * Full or partial refund of a succeeded intent. The intent row is locked, so
   * concurrent refunds can never add up to more than the amount. Must run inside
   * the caller's transaction (idempotency).
   */
  async create(
    manager: EntityManager,
    merchantId: string,
    dto: CreateRefundDto,
  ): Promise<RefundJson> {
    const pi = await this.intents.lock(manager, merchantId, dto.payment_intent);
    if (pi.status !== 'succeeded') {
      throw new DomainError(
        'PAYMENT_INTENT_UNEXPECTED_STATE',
        `Only succeeded payments can be refunded (status: ${pi.status}).`,
        { status_current: pi.status },
      );
    }
    const refundable = pi.amount - pi.amountRefunded;
    const amount = dto.amount ?? refundable;
    if (refundable === 0 || amount > refundable) {
      throw new DomainError(
        'REFUND_EXCEEDS_AMOUNT',
        `The refund amount exceeds what is left to refund (${refundable}).`,
        { refundable_amount: refundable },
      );
    }

    const refund = await manager.getRepository(Refund).save(
      this.repo.create({
        id: newId('re'),
        merchantId,
        paymentIntentId: pi.id,
        amount,
        reason: dto.reason ?? null,
        status: 'succeeded',
      }),
    );
    pi.amountRefunded += amount;
    await manager.getRepository(PaymentIntent).save(pi);

    const json = toRefundJson(refund);
    await this.events.record(manager, {
      merchantId,
      type: 'refund.created',
      paymentIntentId: pi.id,
      data: { ...json, payment_intent_object: toPaymentIntentJson(pi) },
    });
    return json;
  }

  async list(merchantId: string, paymentIntentId?: string): Promise<RefundJson[]> {
    const refunds = await this.repo.find({
      where: { merchantId, ...(paymentIntentId ? { paymentIntentId } : {}) },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return refunds.map(toRefundJson);
  }
}
