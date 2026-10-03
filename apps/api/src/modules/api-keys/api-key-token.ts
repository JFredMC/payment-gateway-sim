import { createHash } from 'node:crypto';
import { randomBase62 } from '../../common/ids/public-id';
import type { ApiKeyType } from './entities/api-key.entity';

export const API_KEY_PREFIX: Record<ApiKeyType, string> = {
  publishable: 'pk_test_',
  secret: 'sk_test_',
};

const TOKEN_PATTERN = /^(pk|sk)_test_[0-9A-Za-z]{32}$/;

/** `sk_test_` + 32 base62 chars (≈ 190 bits): high entropy, so a plain SHA-256 is enough. */
export function generateApiKeyToken(type: ApiKeyType): string {
  return API_KEY_PREFIX[type] + randomBase62(32);
}

export function hashApiKeyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cheap syntactic check before touching the database. */
export function parseApiKeyToken(token: string): ApiKeyType | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  return token.startsWith('pk_') ? 'publishable' : 'secret';
}

/** `sk_test_…a1B2`: what the dashboard shows for a secret key after creation. */
export function maskApiKey(type: ApiKeyType, last4: string): string {
  return `${API_KEY_PREFIX[type]}…${last4}`;
}
