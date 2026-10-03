import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
import { ApiKeyAuth, CurrentMerchant, type MerchantContext } from '../api-keys/api-key-auth';
import { AccountDto } from './dto/account.dto';
import { MerchantsService } from './merchants.service';

@ApiTags('merchant API · account')
@Controller('account')
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get()
  @ApiKeyAuth('secret')
  @ApiOperation({ summary: 'The merchant account that owns the secret key' })
  @ApiOkResponse({ type: AccountDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto, description: 'INVALID_API_KEY' })
  async retrieve(@CurrentMerchant() merchant: MerchantContext): Promise<AccountDto> {
    return AccountDto.fromEntity(await this.merchants.getById(merchant.id));
  }
}
