import {
  formatSignatureHeader,
  isAcknowledged,
  listensTo,
  MAX_WEBHOOK_ATTEMPTS,
  parseSignatureHeader,
  retryDelaySeconds,
  signedPayload,
  webhookUrlProblem,
} from './webhooks';

const SIG = 'a'.repeat(64);

describe('webhook rules', () => {
  it('signs "<timestamp>.<body>" and round-trips the header', () => {
    expect(signedPayload(1_790_000_000, '{"id":"evt_1"}')).toBe('1790000000.{"id":"evt_1"}');
    const header = formatSignatureHeader(1_790_000_000, SIG);
    expect(header).toBe(`t=1790000000,v1=${SIG}`);
    expect(parseSignatureHeader(header)).toEqual({ timestamp: 1_790_000_000, signatures: [SIG] });
  });

  it('accepts several v1 signatures and rejects malformed headers', () => {
    const other = 'b'.repeat(64);
    expect(parseSignatureHeader(`t=1, v1=${SIG}, v1=${other}`)?.signatures).toEqual([SIG, other]);
    expect(parseSignatureHeader(`v1=${SIG}`)).toBeNull();
    expect(parseSignatureHeader('t=1,v1=nothex')).toBeNull();
    expect(parseSignatureHeader('')).toBeNull();
  });

  it('matches subscribed event types (or every type with *)', () => {
    expect(listensTo(['*'], 'refund.created')).toBe(true);
    expect(listensTo(['payment_intent.succeeded'], 'payment_intent.succeeded')).toBe(true);
    expect(listensTo(['payment_intent.succeeded'], 'refund.created')).toBe(false);
  });

  it('backs off exponentially with jitter and stops after the last attempt', () => {
    const noJitter = () => 0.5;
    expect([1, 2, 3, 4, 5].map((n) => retryDelaySeconds(n, 10, noJitter))).toEqual([
      10, 50, 250, 1250, 6250,
    ]);
    expect(retryDelaySeconds(MAX_WEBHOOK_ATTEMPTS, 10, noJitter)).toBeNull();
    expect(retryDelaySeconds(1, 10, () => 0)).toBe(9);
    expect(retryDelaySeconds(1, 10, () => 0.999999)).toBeCloseTo(11, 3);
  });

  it('treats only 2xx as acknowledged', () => {
    expect([200, 204, 299].every(isAcknowledged)).toBe(true);
    expect([199, 301, 400, 500].some(isAcknowledged)).toBe(false);
  });

  it('requires https unless insecure targets are allowed', () => {
    expect(webhookUrlProblem('https://tienda.example/webhooks', false)).toBeNull();
    expect(webhookUrlProblem('http://localhost:4000/hook', false)).toBe('https_required');
    expect(webhookUrlProblem('http://localhost:4000/hook', true)).toBeNull();
    expect(webhookUrlProblem('ftp://example.com', true)).toBe('invalid_url');
    expect(webhookUrlProblem('no es una url', true)).toBe('invalid_url');
    expect(webhookUrlProblem('https://user:pass@example.com', false)).toBe('credentials_in_url');
  });
});
