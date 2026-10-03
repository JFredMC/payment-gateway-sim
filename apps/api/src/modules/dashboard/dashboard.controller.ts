import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PublicIdPipe } from '../../common/pipes/public-id.pipe';
import { EventsService } from '../events/events.service';
import { ApiIdempotent, IdempotencyKey } from '../idempotency/idempotency-key.decorator';
import { IdempotencyService, sendIdempotent } from '../idempotency/idempotency.service';
import { CancelPaymentIntentDto } from '../payments/dto/confirm-payment-intent.dto';
import { CreatePaymentIntentDto } from '../payments/dto/create-payment-intent.dto';
import { DashboardRefundDto } from './dashboard-refund.dto';
import { ListPaymentIntentsQueryDto } from '../payments/dto/list-query.dto';
import { PaymentIntentsService } from '../payments/payment-intents.service';
import { RefundsService } from '../payments/refunds.service';
import { WebhookDeliveriesService } from '../webhooks/webhook-deliveries.service';
import { SummaryQueryDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

/**
 * Merchant dashboard (JWT session). Same objects as the merchant API, plus
 * KPIs and the payment detail view (timeline, refunds, webhook deliveries).
 */
@ApiTags('dashboard · payments')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly intents: PaymentIntentsService,
    private readonly refunds: RefundsService,
    private readonly events: EventsService,
    private readonly deliveries: WebhookDeliveriesService,
    private readonly idempotency: IdempotencyService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'KPIs in COP for the last 7 or 30 days (Bogotá calendar days)' })
  summary(@CurrentUser() user: AuthUser, @Query() query: SummaryQueryDto) {
    return this.dashboard.summary(user.merchantId, query.days ?? 7);
  }

  @Get('payment-intents')
  @ApiOperation({ summary: 'Payments, newest first' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListPaymentIntentsQueryDto) {
    return this.intents.list(user.merchantId, query);
  }

  @Post('payment-intents')
  @ApiIdempotent()
  @ApiOperation({
    summary: 'Create a test payment (returns the client secret for the checkout link)',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() key: string,
    @Body() dto: CreatePaymentIntentDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.dataSource.transaction((manager) =>
      this.idempotency.execute(
        manager,
        {
          merchantId: user.merchantId,
          key,
          scope: 'POST /dashboard/payment-intents',
          payload: dto,
        },
        () => this.intents.create(manager, user.merchantId, dto),
      ),
    );
    return sendIdempotent(res, result);
  }

  @Get('payment-intents/:id')
  @ApiOperation({ summary: 'Payment detail: intent, refunds, timeline and webhook deliveries' })
  async detail(@CurrentUser() user: AuthUser, @Param('id', new PublicIdPipe('pi')) id: string) {
    const paymentIntent = await this.intents.retrieve(user.merchantId, id);
    const [refunds, events, deliveries] = await Promise.all([
      this.refunds.list(user.merchantId, id),
      this.events.list(user.merchantId, { payment_intent: id, limit: 100 }),
      this.deliveries.listForPaymentIntent(user.merchantId, id),
    ]);
    return {
      object: 'payment_intent_detail' as const,
      payment_intent: paymentIntent,
      refunds,
      timeline: [...events.data].reverse(),
      webhook_deliveries: deliveries,
    };
  }

  @Post('payment-intents/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a payment that is not finished yet' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new PublicIdPipe('pi')) id: string,
    @Body() dto: CancelPaymentIntentDto,
  ) {
    return this.intents.cancel(user.merchantId, id, dto.cancellation_reason);
  }

  @Post('payment-intents/:id/refunds')
  @ApiIdempotent()
  @ApiOperation({ summary: 'Refund a succeeded payment (full by default, or partial)' })
  async refund(
    @CurrentUser() user: AuthUser,
    @Param('id', new PublicIdPipe('pi')) id: string,
    @IdempotencyKey() key: string,
    @Body() dto: DashboardRefundDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.dataSource.transaction((manager) =>
      this.idempotency.execute(
        manager,
        {
          merchantId: user.merchantId,
          key,
          scope: `POST /dashboard/payment-intents/${id}/refunds`,
          payload: dto,
        },
        () => this.refunds.create(manager, user.merchantId, { ...dto, payment_intent: id }),
      ),
    );
    return sendIdempotent(res, result);
  }
}
