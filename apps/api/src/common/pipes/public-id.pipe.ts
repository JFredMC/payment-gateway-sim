import { Injectable, type PipeTransform } from '@nestjs/common';
import { DomainError } from '../errors/domain-error';
import type { IdPrefix } from '../ids/public-id';

/** Route param guard: a malformed `pi_…` id is simply "not found". */
@Injectable()
export class PublicIdPipe implements PipeTransform<string, string> {
  private readonly pattern: RegExp;

  constructor(private readonly prefix: IdPrefix) {
    this.pattern = new RegExp(`^${prefix}_[0-9A-Za-z]{24}$`);
  }

  transform(value: string): string {
    if (!this.pattern.test(value)) {
      throw new DomainError('NOT_FOUND', `No such object: ${value.slice(0, 64)}`);
    }
    return value;
  }
}
