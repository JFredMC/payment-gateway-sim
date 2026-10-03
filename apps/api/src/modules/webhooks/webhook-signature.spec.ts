import { createHmac } from 'node:crypto';
import {
  computeSignature,
  generateWebhookSecret,
  signatureHeader,
  verifySignature,
} from './webhook-signature';

const SECRET = 'whsec_test_secret';
const BODY = '{"id":"evt_1","type":"payment_intent.succeeded"}';
const NOW = 1_790_000_000_000;

describe('webhook signatures', () => {
  it('is a hex HMAC-SHA256 of "<t>.<body>"', () => {
    const expected = createHmac('sha256', SECRET).update(`1790000000.${BODY}`).digest('hex');
    expect(computeSignature(SECRET, 1_790_000_000, BODY)).toBe(expected);
    expect(signatureHeader(SECRET, BODY, NOW)).toBe(`t=1790000000,v1=${expected}`);
  });

  it('verifies a fresh signature over the raw body', () => {
    const header = signatureHeader(SECRET, BODY, NOW);
    expect(verifySignature(SECRET, BODY, header, NOW + 1000)).toBe(true);
  });

  it('rejects a tampered body, a wrong secret, an old timestamp or no header', () => {
    const header = signatureHeader(SECRET, BODY, NOW);
    expect(verifySignature(SECRET, BODY.replace('succeeded', 'canceled'), header, NOW)).toBe(false);
    expect(verifySignature('whsec_other', BODY, header, NOW)).toBe(false);
    expect(verifySignature(SECRET, BODY, header, NOW + 301_000)).toBe(false);
    expect(verifySignature(SECRET, BODY, undefined, NOW)).toBe(false);
  });

  it('generates whsec_ secrets', () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_[0-9A-Za-z]{32}$/);
  });
});
