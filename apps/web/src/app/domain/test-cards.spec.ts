import {
  DECLINES,
  decodeOutcome,
  encodeOutcome,
  fundingOf,
  simulateCardOutcome,
  TEST_CARDS,
} from './test-cards';

describe('test cards', () => {
  it('maps the documented test numbers to their outcome', () => {
    expect(simulateCardOutcome('4242424242424242')).toEqual({ kind: 'succeed' });
    expect(simulateCardOutcome('4000002760003184')).toEqual({ kind: 'challenge' });
    expect(simulateCardOutcome('4000000000009995')).toEqual({
      kind: 'decline',
      declineCode: 'insufficient_funds',
    });
  });

  it('approves any other valid number', () => {
    expect(simulateCardOutcome('4111111111111111')).toEqual({ kind: 'succeed' });
    expect(fundingOf('4111111111111111')).toBe('credit');
    expect(fundingOf('4000056655665556')).toBe('debit');
  });

  it('round-trips the stored outcome', () => {
    for (const card of TEST_CARDS) {
      expect(decodeOutcome(encodeOutcome(card.outcome))).toEqual(card.outcome);
    }
    expect(() => decodeOutcome('decline:nope')).toThrow();
  });

  it('has an English and a Spanish message for every decline code', () => {
    for (const info of Object.values(DECLINES)) {
      expect(info.message.length).toBeGreaterThan(5);
      expect(info.messageEs.length).toBeGreaterThan(5);
    }
  });
});
