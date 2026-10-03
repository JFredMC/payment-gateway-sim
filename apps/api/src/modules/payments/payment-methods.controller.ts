import { Body, Controller, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
import { ApiKeyAuth, CurrentMerchant, type MerchantContext } from '../api-keys/api-key-auth';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';
import { toPaymentMethodJson } from './serializers';

@ApiTags('checkout · payment methods')
@Controller('payment_methods')
export class PaymentMethodsController {
  constructor(private readonly methods: PaymentMethodsService) {}

  @Post()
  @ApiKeyAuth('publishable')
  @ApiOperation({
    summary: 'Tokenize a card, PSE bank or Nequi phone',
    description:
      'Validates the card (Luhn, brand, length, expiry, CVC length) and returns a `pm_` id ' +
      'with display data only. The card number and CVC are never stored.',
  })
  @ApiBadRequestResponse({ type: ProblemDetailsDto, description: 'INVALID_CARD' })
  async create(@CurrentMerchant() merchant: MerchantContext, @Body() dto: CreatePaymentMethodDto) {
    return toPaymentMethodJson(await this.methods.create(merchant.id, dto));
  }
}
