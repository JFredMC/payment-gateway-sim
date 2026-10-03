import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicIdPipe } from '../../common/pipes/public-id.pipe';
import { ApiKeyAuth, CurrentMerchant, type MerchantContext } from '../api-keys/api-key-auth';
import { EventsService } from './events.service';
import { ListEventsQueryDto } from './list-events.dto';

@ApiTags('merchant API · events')
@ApiKeyAuth('secret')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Events, newest first (the same objects webhooks deliver)' })
  list(@CurrentMerchant() merchant: MerchantContext, @Query() query: ListEventsQueryDto) {
    return this.events.list(merchant.id, query);
  }

  @Get(':id')
  get(
    @CurrentMerchant() merchant: MerchantContext,
    @Param('id', new PublicIdPipe('evt')) id: string,
  ) {
    return this.events.get(merchant.id, id);
  }
}
