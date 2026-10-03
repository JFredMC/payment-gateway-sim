import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
import { PublicIdPipe } from '../../common/pipes/public-id.pipe';
import { ApiKeyAuth, CurrentMerchant, type MerchantContext } from '../api-keys/api-key-auth';
import { ApiIdempotent, IdempotencyKey } from '../idempotency/idempotency-key.decorator';
import { IdempotencyService, sendIdempotent } from '../idempotency/idempotency.service';
import { CancelPaymentIntentDto, ConfirmPaymentIntentDto } from './dto/confirm-payment-intent.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { ListPaymentIntentsQueryDto } from './dto/list-query.dto';
import { PaymentIntentsService } from './payment-intents.service';

@ApiTags('merchant API · payment intents')
@ApiKeyAuth('secret')
@Controller('payment_intents')
export class PaymentIntentsController {
  constructor(
    private readonly intents: PaymentIntentsService,
    private readonly idempotency: IdempotencyService,
    private readonly dataSource: DataSource,
  ) {}

  @Post()
  @ApiIdempotent()
  @ApiOperation({
    summary: 'Create a payment intent',
    description: 'Starts in `requires_payment_method`. Hand `client_secret` to the checkout.',
  })
  @ApiCreatedResponse({ description: 'The payment intent' })
  async create(
    @CurrentMerchant() merchant: MerchantContext,
    @IdempotencyKey() key: string,
    @Body() dto: CreatePaymentIntentDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.dataSource.transaction((manager) =>
      this.idempotency.execute(
        manager,
        { merchantId: merchant.id, key, scope: 'POST /payment_intents', payload: dto },
        () => this.intents.create(manager, merchant.id, dto),
      ),
    );
    return sendIdempotent(res, result);
  }

  @Get()
  @ApiOperation({ summary: 'List payment intents (newest first, cursor pagination)' })
  list(@CurrentMerchant() merchant: MerchantContext, @Query() query: ListPaymentIntentsQueryDto) {
    return this.intents.list(merchant.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a payment intent' })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  retrieve(
    @CurrentMerchant() merchant: MerchantContext,
    @Param('id', new PublicIdPipe('pi')) id: string,
  ) {
    return this.intents.retrieve(merchant.id, id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @ApiIdempotent()
  @ApiOperation({
    summary: 'Confirm with a payment method (server side)',
    description:
      'Always 200 with the updated intent: a decline is reported in `last_payment_error` ' +
      '(status back to `requires_payment_method`, or `failed` after 3 attempts).',
  })
  @ApiOkResponse({ description: 'The payment intent' })
  @ApiConflictResponse({ type: ProblemDetailsDto, description: 'PAYMENT_INTENT_UNEXPECTED_STATE' })
  async confirm(
    @CurrentMerchant() merchant: MerchantContext,
    @Param('id', new PublicIdPipe('pi')) id: string,
    @IdempotencyKey() key: string,
    @Body() dto: ConfirmPaymentIntentDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.dataSource.transaction((manager) =>
      this.idempotency.execute(
        manager,
        {
          merchantId: merchant.id,
          key,
          scope: `POST /payment_intents/${id}/confirm`,
          payload: dto,
        },
        () => this.intents.confirm(manager, merchant.id, id, dto.payment_method),
        200,
      ),
    );
    return sendIdempotent(res, result);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel (only before it succeeds)' })
  @ApiConflictResponse({ type: ProblemDetailsDto, description: 'PAYMENT_INTENT_UNEXPECTED_STATE' })
  cancel(
    @CurrentMerchant() merchant: MerchantContext,
    @Param('id', new PublicIdPipe('pi')) id: string,
    @Body() dto: CancelPaymentIntentDto,
  ) {
    return this.intents.cancel(merchant.id, id, dto.cancellation_reason);
  }
}
