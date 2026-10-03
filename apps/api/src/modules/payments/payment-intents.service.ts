import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { newId, randomBase62 } from '../../common/ids/public-id';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import type { EventType } from '../../domain/events';
import { pseBankByCode } from '../../domain/local-methods';
import {
  canCancel,
  canConfirm,
  canTransition,
  PAYMENT_METHOD_TYPES,
  type PaymentIntentStatus,
  statusAfterFailure,
} from '../../domain/payment-intent-state';
import { DECLINES, type DeclineCode, decodeOutcome } from '../../domain/test-cards';
import { EventsService } from '../events/events.service';
import type { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import type { ListPaymentIntentsQueryDto } from './dto/list-query.dto';
import {
  type CancellationReason,
  type NextAction,
  PaymentIntent,
} from './entities/payment-intent.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { type ListJson, type PaymentIntentJson, toPaymentIntentJson } from './serializers';

const DEFAULT_PAGE_SIZE = 20;

/**
 * PaymentIntent lifecycle. Every state change happens in a transaction with the
 * intent row locked (SELECT … FOR UPDATE), goes through the domain state machine
 * and records an event in the same transaction.
 */
@Injectable()
export class PaymentIntentsService {
  constructor(
    @InjectRepository(PaymentIntent) private readonly repo: Repository<PaymentIntent>,
    private readonly dataSource: DataSource,
    private readonly events: EventsService,
  ) {}

  /** Must run inside the caller's transaction (idempotency). */
  async create(
    manager: EntityManager,
    merchantId: string,
    dto: CreatePaymentIntentDto,
  ): Promise<PaymentIntentJson> {
    const id = newId('pi');
    const repo = manager.getRepository(PaymentIntent);
    const pi = await repo.save(
      repo.create({
        id,
        merchantId,
        amount: dto.amount,
        currency: 'COP',
        status: 'requires_payment_method',
        description: dto.description || null,
        customerEmail: dto.customer_email ?? null,
        metadata: dto.metadata ?? {},
        paymentMethodTypes: dto.payment_method_types ?? [...PAYMENT_METHOD_TYPES],
        clientSecret: `${id}_secret_${randomBase62(24)}`,
        paymentMethodId: null,
        lastPaymentError: null,
        nextAction: null,
        attempts: 0,
        amountRefunded: 0,
        returnUrl: dto.return_url ?? null,
        cancellationReason: null,
        canceledAt: null,
        succeededAt: null,
      }),
    );
    pi.paymentMethod = null;
    await this.emit(manager, pi, 'payment_intent.created');
    return toPaymentIntentJson(pi);
  }

  async retrieve(merchantId: string, id: string): Promise<PaymentIntentJson> {
    return toPaymentIntentJson(await this.find(this.dataSource.manager, merchantId, id));
  }

  async list(
    merchantId: string,
    query: ListPaymentIntentsQueryDto,
  ): Promise<ListJson<PaymentIntentJson>> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const qb = this.repo
      .createQueryBuilder('pi')
      .leftJoinAndSelect('pi.paymentMethod', 'pm')
      .where('pi.merchant_id = :merchantId', { merchantId })
      .orderBy('pi.created_at', 'DESC')
      .addOrderBy('pi.id', 'DESC')
      .limit(limit + 1); // many-to-one join: no row fan-out, plain LIMIT is exact
    if (query.status) qb.andWhere('pi.status = :status', { status: query.status });
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      qb.andWhere('(pi.created_at, pi.id) < (:createdAt::timestamptz, :id)', cursor);
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      object: 'list',
      data: page.map(toPaymentIntentJson),
      has_more: rows.length > limit,
      next_cursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  /** Resolves an intent from the buyer-side capability (constant-time comparison). */
  async findByClientSecret(id: string, clientSecret: string): Promise<PaymentIntent> {
    const pi = await this.repo.findOne({ where: { id }, relations: { paymentMethod: true } });
    if (!pi || !safeEqual(pi.clientSecret, clientSecret)) {
      throw new DomainError('INVALID_CLIENT_SECRET', 'No such payment for this client secret.');
    }
    return pi;
  }

  /**
   * Attaches the payment method and runs the (simulated) authorization. A decline
   * is NOT an HTTP error: the attempt is persisted and the intent goes back to
   * `requires_payment_method` with `last_payment_error` (or `failed` after the
   * last attempt). Must run inside the caller's transaction (idempotency).
   */
  async confirm(
    manager: EntityManager,
    merchantId: string,
    id: string,
    paymentMethodId: string,
  ): Promise<PaymentIntentJson> {
    const pi = await this.lock(manager, merchantId, id);
    if (!canConfirm(pi.status)) {
      throw unexpectedState(pi, 'confirm');
    }
    const pm = await manager
      .getRepository(PaymentMethod)
      .findOneBy({ id: paymentMethodId, merchantId });
    if (!pm) {
      throw new DomainError(
        'INVALID_PAYMENT_METHOD',
        `No such payment method: ${paymentMethodId}`,
        {
          param: 'payment_method',
        },
      );
    }
    if (!pi.paymentMethodTypes.includes(pm.type)) {
      throw new DomainError(
        'PAYMENT_METHOD_NOT_ALLOWED',
        `This payment does not accept ${pm.type} (allowed: ${pi.paymentMethodTypes.join(', ')}).`,
      );
    }

    pi.attempts += 1;
    pi.paymentMethodId = pm.id;
    pi.paymentMethod = pm;
    pi.lastPaymentError = null;
    pi.nextAction = null;
    await this.move(manager, pi, 'processing', 'payment_intent.processing');

    const outcome = decodeOutcome(pm.simulatedOutcome);
    if (outcome.kind === 'succeed') {
      await this.succeed(manager, pi);
    } else if (outcome.kind === 'decline') {
      await this.fail(manager, pi, outcome.declineCode);
    } else {
      pi.nextAction = nextActionFor(pm);
      await this.move(manager, pi, 'requires_action', 'payment_intent.requires_action');
    }
    return toPaymentIntentJson(pi);
  }

  /** Result of the simulated 3DS challenge, PSE bank page or Nequi push. */
  authenticate(id: string, clientSecret: string, result: 'approve' | 'reject') {
    return this.dataSource.transaction(async (manager) => {
      const { merchantId } = await this.findByClientSecret(id, clientSecret);
      const pi = await this.lock(manager, merchantId, id);
      if (pi.status !== 'requires_action') {
        throw unexpectedState(pi, 'authenticate');
      }
      pi.nextAction = null;
      if (result === 'approve') {
        await this.move(manager, pi, 'processing', 'payment_intent.processing');
        await this.succeed(manager, pi);
      } else {
        await this.fail(
          manager,
          pi,
          pi.paymentMethod?.type === 'card' ? 'authentication_failed' : 'payment_rejected',
        );
      }
      return toPaymentIntentJson(pi);
    });
  }

  cancel(merchantId: string, id: string, reason?: CancellationReason) {
    return this.dataSource.transaction(async (manager) => {
      const pi = await this.lock(manager, merchantId, id);
      if (!canCancel(pi.status)) {
        throw unexpectedState(pi, 'cancel');
      }
      pi.nextAction = null;
      pi.canceledAt = new Date();
      pi.cancellationReason = reason ?? null;
      await this.move(manager, pi, 'canceled', 'payment_intent.canceled');
      return toPaymentIntentJson(pi);
    });
  }

  /** Loads and row-locks an intent of the merchant (inside a transaction). */
  async lock(manager: EntityManager, merchantId: string, id: string): Promise<PaymentIntent> {
    const pi = await manager
      .getRepository(PaymentIntent)
      .createQueryBuilder('pi')
      .setLock('pessimistic_write')
      .where('pi.id = :id AND pi.merchant_id = :merchantId', { id, merchantId })
      .getOne();
    if (!pi) throw notFound(id);
    pi.paymentMethod = pi.paymentMethodId
      ? await manager.getRepository(PaymentMethod).findOneBy({ id: pi.paymentMethodId })
      : null;
    return pi;
  }

  private async find(manager: EntityManager, merchantId: string, id: string) {
    const pi = await manager.getRepository(PaymentIntent).findOne({
      where: { id, merchantId },
      relations: { paymentMethod: true },
    });
    if (!pi) throw notFound(id);
    return pi;
  }

  private async succeed(manager: EntityManager, pi: PaymentIntent) {
    pi.succeededAt = new Date();
    await this.move(manager, pi, 'succeeded', 'payment_intent.succeeded');
  }

  private async fail(manager: EntityManager, pi: PaymentIntent, code: DeclineCode) {
    const info = DECLINES[code];
    pi.lastPaymentError = {
      type: pi.paymentMethod?.type === 'card' ? 'card_error' : 'payment_method_error',
      code: info.errorCode,
      decline_code: code,
      message: info.message,
      payment_method_type: pi.paymentMethod?.type ?? 'card',
    };
    await this.move(manager, pi, statusAfterFailure(pi.attempts), 'payment_intent.payment_failed');
  }

  /** The only place where `status` changes: guarded by the domain state machine. */
  private async move(
    manager: EntityManager,
    pi: PaymentIntent,
    to: PaymentIntentStatus,
    event: EventType,
  ) {
    if (!canTransition(pi.status, to)) {
      throw new Error(`Illegal payment intent transition ${pi.status} -> ${to} (${pi.id})`);
    }
    pi.status = to;
    await manager.getRepository(PaymentIntent).save(pi);
    await this.emit(manager, pi, event);
  }

  private emit(manager: EntityManager, pi: PaymentIntent, type: EventType) {
    return this.events.record(manager, {
      merchantId: pi.merchantId,
      type,
      paymentIntentId: pi.id,
      data: toPaymentIntentJson(pi),
    });
  }
}

function nextActionFor(pm: PaymentMethod): NextAction {
  switch (pm.type) {
    case 'card':
      return {
        type: 'three_d_secure',
        three_d_secure: { brand: pm.cardBrand ?? 'card', last4: pm.cardLast4 ?? '' },
      };
    case 'pse':
      return {
        type: 'pse_redirect',
        pse_redirect: {
          bank_code: pm.pseBankCode ?? '',
          bank_name: pseBankByCode(pm.pseBankCode ?? '')?.name ?? 'Banco',
        },
      };
    case 'nequi':
      return {
        type: 'nequi_push',
        nequi_push: { phone: `••• ••• ${pm.nequiPhoneLast4 ?? ''}` },
      };
  }
}

function notFound(id: string) {
  return new DomainError('NOT_FOUND', `No such payment_intent: ${id}`);
}

function unexpectedState(pi: PaymentIntent, action: string) {
  return new DomainError(
    'PAYMENT_INTENT_UNEXPECTED_STATE',
    `You cannot ${action} this payment intent because it has a status of ${pi.status}.`,
    { status_current: pi.status },
  );
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
