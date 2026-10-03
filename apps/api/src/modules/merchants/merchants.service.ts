import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { newId } from '../../common/ids/public-id';
import { Merchant } from './entities/merchant.entity';

@Injectable()
export class MerchantsService {
  constructor(@InjectRepository(Merchant) private readonly merchants: Repository<Merchant>) {}

  /** Called inside the sign-up transaction. */
  create(manager: EntityManager, businessName: string): Promise<Merchant> {
    const repo = manager.getRepository(Merchant);
    return repo.save(repo.create({ id: newId('acct'), businessName }));
  }

  async getById(id: string): Promise<Merchant> {
    const merchant = await this.merchants.findOneBy({ id });
    if (!merchant) throw new DomainError('NOT_FOUND', 'Merchant not found.');
    return merchant;
  }
}
