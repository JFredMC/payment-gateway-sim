import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PublicIdPipe } from '../../common/pipes/public-id.pipe';
import {
  CreateWebhookEndpointDto,
  ListWebhookDeliveriesQueryDto,
  UpdateWebhookEndpointDto,
} from './dto/webhook-endpoint.dto';
import { toWebhookDeliveryJson } from './serializers';
import { WebhookDeliveriesService } from './webhook-deliveries.service';
import { WebhookDispatcher } from './webhook-dispatcher';
import { WebhookEndpointsService } from './webhook-endpoints.service';

@ApiTags('dashboard · webhooks')
@ApiBearerAuth()
@Controller('dashboard/webhook-endpoints')
export class WebhookEndpointsController {
  constructor(private readonly endpoints: WebhookEndpointsService) {}

  @Get()
  @ApiOperation({ summary: 'Webhook endpoints of the merchant (with their signing secret)' })
  list(@CurrentUser() user: AuthUser) {
    return this.endpoints.list(user.merchantId);
  }

  @Post()
  @ApiOperation({
    summary: 'Register an endpoint',
    description:
      'URLs must be https (http and private addresses only when WEBHOOK_ALLOW_INSECURE_URLS=true). ' +
      'Each delivery is signed with the returned `secret` (header `Pasarela-Signature`).',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWebhookEndpointDto) {
    return this.endpoints.create(user.merchantId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', new PublicIdPipe('we')) id: string) {
    return this.endpoints.get(user.merchantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update the URL, description, events or status (enabled/disabled)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new PublicIdPipe('we')) id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.endpoints.update(user.merchantId, id, dto);
  }

  @Post(':id/roll-secret')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace the signing secret (the old one stops working at once)' })
  rollSecret(@CurrentUser() user: AuthUser, @Param('id', new PublicIdPipe('we')) id: string) {
    return this.endpoints.rollSecret(user.merchantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the endpoint and its delivery log' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', new PublicIdPipe('we')) id: string) {
    await this.endpoints.remove(user.merchantId, id);
  }
}

@ApiTags('dashboard · webhooks')
@ApiBearerAuth()
@Controller('dashboard/webhook-deliveries')
export class WebhookDeliveriesController {
  constructor(
    private readonly deliveries: WebhookDeliveriesService,
    private readonly dispatcher: WebhookDispatcher,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Delivery log, newest first (filter by endpoint, event or status)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListWebhookDeliveriesQueryDto) {
    return this.deliveries.list(user.merchantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A delivery with its attempts and the exact payload' })
  get(@CurrentUser() user: AuthUser, @Param('id', new PublicIdPipe('whdel')) id: string) {
    return this.deliveries.get(user.merchantId, id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send the event again now (one extra attempt, logged as manual)' })
  async retry(@CurrentUser() user: AuthUser, @Param('id', new PublicIdPipe('whdel')) id: string) {
    const delivery = await this.deliveries.find(user.merchantId, id);
    await this.dispatcher.attempt(delivery.id, true);
    return toWebhookDeliveryJson(await this.deliveries.find(user.merchantId, id), true);
  }
}
