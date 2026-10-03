import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { newId } from '../../common/ids/public-id';
import { generateApiKeyToken, hashApiKeyToken, parseApiKeyToken } from './api-key-token';
import { ApiKeyDto } from './dto/api-key.dto';
import { ApiKey, type ApiKeyType } from './entities/api-key.entity';

export interface AuthenticatedKey {
  merchantId: string;
  keyId: string;
  type: ApiKeyType;
}

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey) private readonly keys: Repository<ApiKey>,
    private readonly dataSource: DataSource,
  ) {}

  /** One publishable + one secret key, created in the sign-up transaction. */
  async issueInitialKeys(manager: EntityManager, merchantId: string): Promise<void> {
    await this.insert(manager, merchantId, 'publishable');
    await this.insert(manager, merchantId, 'secret');
  }

  async list(merchantId: string): Promise<ApiKeyDto[]> {
    const keys = await this.keys.find({
      where: { merchantId, revokedAt: IsNull() },
      order: { type: 'ASC' },
    });
    return keys.map((key) => ApiKeyDto.fromEntity(key));
  }

  /**
   * Revokes the active key of that type and issues a new one. The full secret
   * is returned only in this response; afterwards only its last 4 are known.
   */
  roll(merchantId: string, type: ApiKeyType): Promise<ApiKeyDto> {
    return this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(ApiKey)
        .update({ merchantId, type, revokedAt: IsNull() }, { revokedAt: new Date() });
      const { key, token } = await this.insert(manager, merchantId, type);
      return ApiKeyDto.fromEntity(key, type === 'secret' ? token : undefined);
    });
  }

  /** Resolves an active key from its raw token, or null. Records the last use (≤ 1/min). */
  async authenticate(token: string): Promise<AuthenticatedKey | null> {
    const type = parseApiKeyToken(token);
    if (!type) return null;
    const key = await this.keys.findOne({
      where: { tokenHash: hashApiKeyToken(token), revokedAt: IsNull() },
    });
    if (!key) return null;
    await this.keys.query(
      `UPDATE api_keys SET last_used_at = now()
        WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
      [key.id],
    );
    return { merchantId: key.merchantId, keyId: key.id, type: key.type };
  }

  /** The active publishable key (the checkout page needs it). */
  async publishableKeyOf(merchantId: string): Promise<string | null> {
    const key = await this.keys.findOneBy({
      merchantId,
      type: 'publishable',
      revokedAt: IsNull(),
    });
    return key?.publishableToken ?? null;
  }

  private async insert(manager: EntityManager, merchantId: string, type: ApiKeyType) {
    const token = generateApiKeyToken(type);
    const repo = manager.getRepository(ApiKey);
    const key = await repo.save(
      repo.create({
        id: newId('key'),
        merchantId,
        type,
        tokenHash: hashApiKeyToken(token),
        last4: token.slice(-4),
        publishableToken: type === 'publishable' ? token : null,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    return { key, token };
  }
}
