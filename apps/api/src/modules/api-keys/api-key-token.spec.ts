import {
  generateApiKeyToken,
  hashApiKeyToken,
  maskApiKey,
  parseApiKeyToken,
} from './api-key-token';

describe('api key tokens', () => {
  it('generates prefixed high-entropy tokens', () => {
    expect(generateApiKeyToken('secret')).toMatch(/^sk_test_[0-9A-Za-z]{32}$/);
    expect(generateApiKeyToken('publishable')).toMatch(/^pk_test_[0-9A-Za-z]{32}$/);
  });

  it('parses the key type and rejects malformed tokens', () => {
    expect(parseApiKeyToken(generateApiKeyToken('secret'))).toBe('secret');
    expect(parseApiKeyToken(generateApiKeyToken('publishable'))).toBe('publishable');
    expect(parseApiKeyToken('sk_live_' + 'a'.repeat(32))).toBeNull();
    expect(parseApiKeyToken('sk_test_short')).toBeNull();
    expect(parseApiKeyToken('')).toBeNull();
  });

  it('hashes deterministically with SHA-256 (hex)', () => {
    expect(hashApiKeyToken('sk_test_x')).toBe(hashApiKeyToken('sk_test_x'));
    expect(hashApiKeyToken('sk_test_x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('masks a key for display', () => {
    expect(maskApiKey('secret', 'a1B2')).toBe('sk_test_…a1B2');
  });
});
