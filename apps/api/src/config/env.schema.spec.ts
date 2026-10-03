import { durationToSeconds, validateDatabaseEnv, validateEnv } from './env.schema';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgres://pasarela:pasarela@localhost:5432/pasarela',
  };

  it('applies defaults for optional variables', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_SSL).toBe(false);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200']);
  });

  it('parses and coerces provided values', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      DATABASE_SSL: 'true',
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_SSL).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('fails fast with a clear message when a required variable is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });
});

describe('validateDatabaseEnv', () => {
  it('only requires database settings', () => {
    expect(validateDatabaseEnv({ DATABASE_URL: 'postgresql://u:p@h/db' })).toEqual({
      DATABASE_URL: 'postgresql://u:p@h/db',
      DATABASE_SSL: false,
      DATABASE_MIGRATIONS_RUN: false,
    });
  });
});

describe('durationToSeconds', () => {
  it.each([
    ['900', 900],
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604800],
  ])('%s -> %i', (input, expected) => {
    expect(durationToSeconds(input)).toBe(expected);
  });

  it('throws on invalid input', () => {
    expect(() => durationToSeconds('15 minutes')).toThrow();
  });
});
