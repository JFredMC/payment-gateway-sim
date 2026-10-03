import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
import { ApiKeyAuth, CurrentMerchant, type MerchantContext } from '../api-keys/api-key-auth';
import { ApiIdempotent, IdempotencyKey } from '../idempotency/idempotency-key.decorator';
import { IdempotencyService, sendIdempotent } from '../idempotency/idempotency.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ListRefundsQueryDto } from './dto/list-query.dto';
import { RefundsService } from './refunds.service';

@ApiTags('merchant API · refunds')
@ApiKeyAuth('secret')
@Controller('refunds')
export class RefundsController {
  constructor(
    private readonly refunds: RefundsService,
    private readonly idempotency: IdempotencyService,
    private readonly dataSource: DataSource,
  ) {}

  @Post()
  @ApiIdempotent()
  @ApiOperation({ summary: 'Refund a succeeded payment (full by default, or partial)' })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto, description: 'REFUND_EXCEEDS_AMOUNT' })
  async create(
    @CurrentMerchant() merchant: MerchantContext,
    @IdempotencyKey() key: string,
    @Body() dto: CreateRefundDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.dataSource.transaction((manager) =>
      this.idempotency.execute(
        manager,
        { merchantId: merchant.id, key, scope: 'POST /refunds', payload: dto },
        () => this.refunds.create(manager, merchant.id, dto),
      ),
    );
    return sendIdempotent(res, result);
  }

  @Get()
  @ApiOperation({ summary: 'List refunds (optionally of one payment intent)' })
  list(@CurrentMerchant() merchant: MerchantContext, @Query() query: ListRefundsQueryDto) {
    return this.refunds.list(merchant.id, query.payment_intent);
  }
}
