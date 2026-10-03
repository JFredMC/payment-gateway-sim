import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key-auth';
import type { ApiKeysService } from './api-keys.service';
import type { ApiKeyType } from './entities/api-key.entity';

function setup(required: ApiKeyType, authorization?: string) {
  const req: { header: (n: string) => string | undefined; merchant?: unknown } = {
    header: (name: string) => (name === 'authorization' ? authorization : undefined),
  };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const keys = { authenticate: jest.fn() };
  const guard = new ApiKeyGuard(reflector, keys as unknown as ApiKeysService);
  return { guard, context, keys, req };
}

describe('ApiKeyGuard', () => {
  it('attaches the merchant for a valid secret key', async () => {
    const { guard, context, keys, req } = setup('secret', 'Bearer sk_test_abc');
    keys.authenticate.mockResolvedValue({ merchantId: 'acct_1', keyId: 'key_1', type: 'secret' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(keys.authenticate).toHaveBeenCalledWith('sk_test_abc');
    expect(req.merchant).toEqual({ id: 'acct_1', keyId: 'key_1', keyType: 'secret' });
  });

  it('rejects a missing Authorization header', async () => {
    const { guard, context } = setup('secret');
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
  });

  it('rejects unknown or revoked keys', async () => {
    const { guard, context, keys } = setup('secret', 'Bearer sk_test_nope');
    keys.authenticate.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
  });

  it('does not accept a publishable key where a secret key is required', async () => {
    const { guard, context, keys } = setup('secret', 'Bearer pk_test_abc');
    keys.authenticate.mockResolvedValue({
      merchantId: 'acct_1',
      keyId: 'key_1',
      type: 'publishable',
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'INVALID_API_KEY',
      message: expect.stringContaining('secret key'),
    });
  });

  it('accepts a secret key on publishable routes', async () => {
    const { guard, context, keys } = setup('publishable', 'Bearer sk_test_abc');
    keys.authenticate.mockResolvedValue({ merchantId: 'acct_1', keyId: 'key_1', type: 'secret' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
