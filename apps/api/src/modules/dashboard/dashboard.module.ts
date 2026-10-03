import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PaymentsModule } from '../payments/payments.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PaymentsModule, EventsModule, WebhooksModule, IdempotencyModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
