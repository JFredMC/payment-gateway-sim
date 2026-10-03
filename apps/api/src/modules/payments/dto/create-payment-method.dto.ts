import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PSE_PERSON_TYPES, type PsePersonType } from '../../../domain/local-methods';
import { PAYMENT_METHOD_TYPES, type PaymentMethodType } from '../../../domain/payment-intent-state';

export class CardDetailsDto {
  @ApiProperty({ example: '4242424242424242', description: 'Never stored nor logged.' })
  @IsString()
  @MaxLength(23)
  number!: string;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  exp_month!: number;

  @ApiProperty({ example: 2030, description: '2 or 4 digits.' })
  @IsInt()
  @Min(0)
  @Max(2100)
  exp_year!: number;

  @ApiProperty({ example: '123', description: 'Checked for length only; never stored.' })
  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'cvc must be 3 or 4 digits' })
  cvc!: string;
}

export class PseDetailsDto {
  @ApiProperty({ example: '1001', description: 'Code from the simulated PSE bank list.' })
  @IsString()
  @MaxLength(8)
  bank!: string;

  @ApiPropertyOptional({ enum: PSE_PERSON_TYPES, default: 'natural' })
  @IsOptional()
  @IsIn(PSE_PERSON_TYPES)
  person_type?: PsePersonType;
}

export class NequiDetailsDto {
  @ApiProperty({ example: '3001234567', description: 'Colombian mobile number.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s/g, '') : value,
  )
  @IsString()
  @Matches(/^3\d{9}$/, { message: 'phone must be a 10-digit Colombian mobile number' })
  phone!: string;
}

export class BillingDetailsDto {
  @ApiPropertyOptional({ example: 'Ana Gómez' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'ana@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class CreatePaymentMethodDto {
  @ApiProperty({ enum: PAYMENT_METHOD_TYPES })
  @IsIn(PAYMENT_METHOD_TYPES)
  type!: PaymentMethodType;

  @ApiPropertyOptional({ type: CardDetailsDto })
  @ValidateIf((o: CreatePaymentMethodDto) => o.type === 'card')
  @IsDefined()
  @ValidateNested()
  @Type(() => CardDetailsDto)
  card?: CardDetailsDto;

  @ApiPropertyOptional({ type: PseDetailsDto })
  @ValidateIf((o: CreatePaymentMethodDto) => o.type === 'pse')
  @IsDefined()
  @ValidateNested()
  @Type(() => PseDetailsDto)
  pse?: PseDetailsDto;

  @ApiPropertyOptional({ type: NequiDetailsDto })
  @ValidateIf((o: CreatePaymentMethodDto) => o.type === 'nequi')
  @IsDefined()
  @ValidateNested()
  @Type(() => NequiDetailsDto)
  nequi?: NequiDetailsDto;

  @ApiPropertyOptional({ type: BillingDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingDetailsDto)
  billing_details?: BillingDetailsDto;
}
