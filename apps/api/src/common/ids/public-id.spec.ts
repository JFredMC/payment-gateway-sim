import { newId, randomBase62 } from './public-id';

describe('public ids', () => {
  it('generates prefixed base62 ids', () => {
    expect(newId('pi')).toMatch(/^pi_[0-9A-Za-z]{24}$/);
    expect(newId('whdel')).toMatch(/^whdel_[0-9A-Za-z]{24}$/);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId('evt')));
    expect(ids.size).toBe(1000);
  });

  it('returns exactly the requested length', () => {
    expect(randomBase62(1)).toHaveLength(1);
    expect(randomBase62(64)).toMatch(/^[0-9A-Za-z]{64}$/);
  });
});
