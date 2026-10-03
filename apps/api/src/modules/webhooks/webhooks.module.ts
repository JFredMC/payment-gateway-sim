import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookDeliveriesService } from './webhook-deliveries.service';
import { WebhookDispatcher } from './webhook-dispatcher';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import { WebhookDeliveriesController, WebhookEndpointsController } from './webhooks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEndpoint, WebhookDelivery]), EventsModule],
  controllers: [WebhookEndpointsController, WebhookDeliveriesController],
  providers: [WebhookEndpointsService, WebhookDeliveriesService, WebhookDispatcher],
  exports: [WebhookDispatcher, WebhookDeliveriesService],
})
export class WebhooksModule {}
