import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyDto } from './dto/api-key.dto';
import { RollApiKeyDto } from './dto/roll-api-key.dto';

@ApiTags('dashboard · api keys')
@ApiBearerAuth()
@Controller('dashboard/api-keys')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'Active API keys of the merchant (secret keys masked)' })
  @ApiOkResponse({ type: ApiKeyDto, isArray: true })
  list(@CurrentUser() user: AuthUser): Promise<ApiKeyDto[]> {
    return this.keys.list(user.merchantId);
  }

  @Post('roll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Roll a key',
    description:
      'Revokes the active key of that type immediately and issues a new one. ' +
      'For secret keys the response includes `secret`: it is the only time it is shown.',
  })
  @ApiOkResponse({ type: ApiKeyDto })
  roll(@CurrentUser() user: AuthUser, @Body() dto: RollApiKeyDto): Promise<ApiKeyDto> {
    return this.keys.roll(user.merchantId, dto.type);
  }
}
