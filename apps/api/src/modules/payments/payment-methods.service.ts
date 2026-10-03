import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { newId } from '../../common/ids/public-id';
import {
  detectBrand,
  isExpired,
  normalizeExpYear,
  normalizePan,
  panProblem,
  cvcLength,
} from '../../domain/cards';
import { pseBankByCode } from '../../domain/local-methods';
import { encodeOutcome, fundingOf, simulateCardOutcome } from '../../domain/test-cards';
import type { CardDetailsDto, CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { PaymentMethod } from './entities/payment-method.entity';

const PAN_MESSAGES = {
  incomplete: 'Your card number is incomplete.',
  unknown_brand: 'Your card brand is not supported.',
  invalid_length: 'Your card number has an invalid length.',
  invalid_checksum: 'Your card number is invalid.',
} as const;

/**
 * Tokenization: turns raw payment details into a `pm_` id. For cards, the PAN is
 * used only in memory here (validation, brand, last 4, simulated outcome) and
 * then dropped: it is never persisted, returned or logged.
 */
@Injectable()
export class PaymentMethodsService {
  constructor(@InjectRepository(PaymentMethod) private readonly repo: Repository<PaymentMethod>) {}

  async create(merchantId: string, dto: CreatePaymentMethodDto, now = new Date()) {
    const base = {
      id: newId('pm'),
      merchantId,
      type: dto.type,
      billingName: dto.billing_details?.name?.trim() || null,
      billingEmail: dto.billing_details?.email ?? null,
    };
    switch (dto.type) {
      case 'card':
        return this.repo.save(this.repo.create({ ...base, ...this.tokenizeCard(dto.card!, now) }));
      case 'pse': {
        const bank = pseBankByCode(dto.pse!.bank);
        if (!bank) {
          throw new DomainError('INVALID_PAYMENT_METHOD', 'Unknown PSE bank.', {
            param: 'pse[bank]',
          });
        }
        return this.repo.save(
          this.repo.create({
            ...base,
            pseBankCode: bank.code,
            psePersonType: dto.pse!.person_type ?? 'natural',
            simulatedOutcome: encodeOutcome({ kind: 'challenge' }),
          }),
        );
      }
      case 'nequi':
        return this.repo.save(
          this.repo.create({
            ...base,
            nequiPhoneLast4: dto.nequi!.phone.slice(-4),
            simulatedOutcome: encodeOutcome({ kind: 'challenge' }),
          }),
        );
    }
  }

  private tokenizeCard(card: CardDetailsDto, now: Date): Partial<PaymentMethod> {
    const pan = normalizePan(card.number);
    const problem = panProblem(pan);
    if (problem) {
      throw new DomainError('INVALID_CARD', PAN_MESSAGES[problem], {
        param: 'card[number]',
        reason: problem,
      });
    }
    const brand = detectBrand(pan)!;
    const expYear = normalizeExpYear(card.exp_year);
    if (isExpired(card.exp_month, expYear, now)) {
      throw new DomainError('INVALID_CARD', "Your card's expiration date is in the past.", {
        param: 'card[exp_year]',
        reason: 'invalid_expiry',
      });
    }
    if (card.cvc.length !== cvcLength(brand)) {
      throw new DomainError('INVALID_CARD', "Your card's security code is invalid.", {
        param: 'card[cvc]',
        reason: 'invalid_cvc',
      });
    }
    return {
      cardBrand: brand,
      cardLast4: pan.slice(-4),
      cardExpMonth: card.exp_month,
      cardExpYear: expYear,
      cardFunding: fundingOf(pan),
      simulatedOutcome: encodeOutcome(simulateCardOutcome(pan)),
    };
  }
}
