import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { DomainError } from '../../common/errors/domain-error';
import { ApiKeysService } from './api-keys.service';
import type { ApiKeyType } from './entities/api-key.entity';

/** Merchant resolved from the API key of the request. */
export interface MerchantContext {
  id: string;
  keyId: string;
  keyType: ApiKeyType;
}

type MerchantRequest = Request & { merchant?: MerchantContext };

export const API_KEY_TYPE = 'apiKeyType';
export const SECRET_KEY_SCHEME = 'secret_key';
export const PUBLISHABLE_KEY_SCHEME = 'publishable_key';

/**
 * Authenticates `Authorization: Bearer sk_test_…` (or `pk_test_…`). A route that
 * accepts the publishable key also accepts the secret key, never the reverse.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keys: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ApiKeyType>(API_KEY_TYPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<MerchantRequest>();
    const match = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    if (!match) {
      throw new DomainError(
        'INVALID_API_KEY',
        `Provide your API key in the Authorization header: "Bearer ${required === 'secret' ? 'sk' : 'pk'}_test_…".`,
      );
    }
    const key = await this.keys.authenticate(match[1]);
    if (!key) {
      throw new DomainError('INVALID_API_KEY', 'Invalid API key provided.');
    }
    if (required === 'secret' && key.type !== 'secret') {
      throw new DomainError('INVALID_API_KEY', 'This endpoint requires a secret key (sk_test_…).');
    }
    req.merchant = { id: key.merchantId, keyId: key.keyId, keyType: key.type };
    return true;
  }
}

/** Marks a merchant-API route: no dashboard JWT, an API key of `type` instead. */
export const ApiKeyAuth = (type: ApiKeyType) =>
  applyDecorators(
    Public(),
    SetMetadata(API_KEY_TYPE, type),
    UseGuards(ApiKeyGuard),
    ApiBearerAuth(type === 'secret' ? SECRET_KEY_SCHEME : PUBLISHABLE_KEY_SCHEME),
  );

export const CurrentMerchant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const merchant = ctx.switchToHttp().getRequest<MerchantRequest>().merchant;
  if (!merchant) throw new Error('CurrentMerchant used on a route without @ApiKeyAuth');
  return merchant;
});
