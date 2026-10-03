import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { DomainError } from '../../common/errors/domain-error';
import { PublicIdPipe } from '../../common/pipes/public-id.pipe';
import { MAX_PAYMENT_ATTEMPTS } from '../../domain/payment-intent-state';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { ApiIdempotent, IdempotencyKey } from '../idempotency/idempotency-key.decorator';
import { IdempotencyService, sendIdempotent } from '../idempotency/idempotency.service';
import { MerchantsService } from '../merchants/merchants.service';
import { CheckoutAuthenticateDto, CheckoutConfirmDto } from './dto/confirm-payment-intent.dto';
import type { PaymentIntent } from './entities/payment-intent.entity';
import { PaymentIntentsService } from './payment-intents.service';
import { toPaymentIntentJson } from './serializers';

/**
 * Buyer-side endpoints of the hosted checkout. They are authorized by the
 * intent's `client_secret` (a capability for that single payment), not by a
 * merchant key or a dashboard session.
 */
@ApiTags('checkout')
@Public()
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly intents: PaymentIntentsService,
    private readonly merchants: MerchantsService,
    private readonly keys: ApiKeysService,
    private readonly idempotency: IdempotencyService,
    private readonly dataSource: DataSource,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'What the checkout page needs to render a payment' })
  @ApiQuery({ name: 'client_secret', required: true })
  async view(
    @Param('id', new PublicIdPipe('pi')) id: string,
    @Query('client_secret') clientSecret: string | undefined,
  ) {
    const pi = await this.intents.findByClientSecret(id, requireSecret(clientSecret));
    return this.toView(pi);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @ApiIdempotent()
  @ApiOperation({ summary: 'Pay with a tokenized payment method' })
  async confirm(
    @Param('id', new PublicIdPipe('pi')) id: string,
    @IdempotencyKey() key: string,
    @Body() dto: CheckoutConfirmDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { merchantId } = await this.intents.findByClientSecret(id, dto.client_secret);
    const result = await this.dataSource.transaction((manager) =>
      this.idempotency.execute(
        manager,
        {
          merchantId,
          key,
          scope: `POST /checkout/${id}/confirm`,
          payload: { payment_method: dto.payment_method },
        },
        async () => {
          await this.intents.confirm(manager, merchantId, id, dto.payment_method);
          return this.toView(await this.intents.lock(manager, merchantId, id));
        },
        200,
      ),
    );
    return sendIdempotent(res, result);
  }

  @Post(':id/authenticate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Result of the simulated 3DS / PSE / Nequi step' })
  async authenticate(
    @Param('id', new PublicIdPipe('pi')) id: string,
    @Body() dto: CheckoutAuthenticateDto,
  ) {
    await this.intents.authenticate(id, dto.client_secret, dto.result);
    return this.toView(await this.intents.findByClientSecret(id, dto.client_secret));
  }

  private async toView(pi: PaymentIntent) {
    const [merchant, publishableKey] = await Promise.all([
      this.merchants.getById(pi.merchantId),
      this.keys.publishableKeyOf(pi.merchantId),
    ]);
    const json = toPaymentIntentJson(pi);
    return {
      object: 'checkout' as const,
      id: json.id,
      amount: json.amount,
      amount_refunded: json.amount_refunded,
      currency: json.currency,
      description: json.description,
      status: json.status,
      merchant: { business_name: merchant.businessName },
      publishable_key: publishableKey,
      payment_method_types: json.payment_method_types,
      payment_method: json.payment_method,
      next_action: json.next_action,
      last_payment_error: json.last_payment_error,
      attempts: json.attempts,
      max_attempts: MAX_PAYMENT_ATTEMPTS,
      return_url: json.return_url,
      created_at: json.created_at,
    };
  }
}

function requireSecret(value: string | undefined): string {
  if (!value || value.length > 100) {
    throw new DomainError('INVALID_CLIENT_SECRET', 'client_secret is required.');
  }
  return value;
}
