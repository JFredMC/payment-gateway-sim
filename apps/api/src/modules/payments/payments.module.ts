import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { EventsModule } from '../events/events.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { CheckoutController } from './checkout.controller';
import { PaymentIntent } from './entities/payment-intent.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { Refund } from './entities/refund.entity';
import { PaymentIntentsController } from './payment-intents.controller';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentIntent, PaymentMethod, Refund]),
    ApiKeysModule,
    MerchantsModule,
    EventsModule,
    IdempotencyModule,
  ],
  controllers: [
    PaymentIntentsController,
    RefundsController,
    PaymentMethodsController,
    CheckoutController,
  ],
  providers: [PaymentIntentsService, PaymentMethodsService, RefundsService],
  exports: [PaymentIntentsService, RefundsService],
})
export class PaymentsModule {}
