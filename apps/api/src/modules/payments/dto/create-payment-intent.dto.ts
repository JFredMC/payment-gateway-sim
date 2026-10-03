import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  MAX_AMOUNT,
  MIN_AMOUNT,
  PAYMENT_METHOD_TYPES,
  type PaymentMethodType,
} from '../../../domain/payment-intent-state';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Stripe-like metadata: up to 20 string values, keys ≤ 40 chars, values ≤ 500 chars. */
function IsMetadata(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isMetadata',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must have at most 20 string values (keys ≤ 40, values ≤ 500 chars)`,
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          const entries = Object.entries(value);
          return (
            entries.length <= 20 &&
            entries.every(
              ([k, v]) =>
                k.length > 0 && k.length <= 40 && typeof v === 'string' && v.length <= 500,
            )
          );
        },
      },
    });
}

export class CreatePaymentIntentDto {
  @ApiProperty({
    example: 2_500_000,
    minimum: MIN_AMOUNT,
    maximum: MAX_AMOUNT,
    description: 'Integer in COP minor units (2 decimals): 2500000 = $ 25.000.',
  })
  @IsInt()
  @Min(MIN_AMOUNT)
  @Max(MAX_AMOUNT)
  amount!: number;

  @ApiPropertyOptional({ example: 'COP', default: 'COP' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(['COP'])
  currency?: 'COP';

  @ApiPropertyOptional({ example: 'Pedido #1042', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 'comprador@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  customer_email?: string;

  @ApiPropertyOptional({ example: { order_id: '1042' } })
  @IsOptional()
  @IsObject()
  @IsMetadata()
  metadata?: Record<string, string>;

  @ApiPropertyOptional({ enum: PAYMENT_METHOD_TYPES, isArray: true, example: ['card', 'pse'] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(PAYMENT_METHOD_TYPES, { each: true })
  payment_method_types?: PaymentMethodType[];

  @ApiPropertyOptional({
    example: 'https://tienda.example/gracias',
    description: 'Where the hosted checkout sends the buyer after paying.',
  })
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  return_url?: string;
}
