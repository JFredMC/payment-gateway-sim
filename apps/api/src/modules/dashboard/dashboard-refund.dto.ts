import { OmitType } from '@nestjs/swagger';
import { CreateRefundDto } from '../payments/dto/create-refund.dto';

/** The payment intent comes from the route. */
export class DashboardRefundDto extends OmitType(CreateRefundDto, ['payment_intent'] as const) {}
