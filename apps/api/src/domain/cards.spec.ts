import {
  cvcLength,
  detectBrand,
  formatPan,
  isExpired,
  luhnValid,
  normalizeExpYear,
  normalizePan,
  panProblem,
} from './cards';
import { TEST_CARDS } from './test-cards';

describe('cards', () => {
  it('normalizes spaces and dashes, rejects other characters', () => {
    expect(normalizePan('4242 4242-4242 4242')).toBe('4242424242424242');
    expect(normalizePan('4242 42a2')).toBe('');
  });

  it('validates the Luhn checksum', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
    expect(luhnValid('42')).toBe(false);
  });

  it('every test card passes Luhn and matches its brand', () => {
    for (const card of TEST_CARDS) {
      expect(luhnValid(card.number)).toBe(true);
      expect(detectBrand(card.number)).toBe(card.brand);
      expect(panProblem(card.number)).toBeNull();
    }
  });

  it.each([
    ['4', 'visa'],
    ['51', 'mastercard'],
    ['2221', 'mastercard'],
    ['2720', 'mastercard'],
    ['34', 'amex'],
    ['37', 'amex'],
    ['36', 'diners'],
    ['3056', 'diners'],
    ['6011', 'discover'],
    ['65', 'discover'],
  ])('detects %s as %s', (prefix, brand) => {
    expect(detectBrand(prefix)).toBe(brand);
  });

  it('returns null for unknown prefixes', () => {
    expect(detectBrand('2721')).toBeNull();
    expect(detectBrand('9')).toBeNull();
  });

  it('explains what is wrong with a number', () => {
    expect(panProblem('4242')).toBe('incomplete');
    expect(panProblem('9999999999999995')).toBe('unknown_brand');
    expect(panProblem('42424242424242')).toBe('invalid_length');
    expect(panProblem('4242424242424241')).toBe('invalid_checksum');
  });

  it('formats numbers per brand', () => {
    expect(formatPan('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatPan('378282246310005')).toBe('3782 822463 10005');
    expect(formatPan('42424')).toBe('4242 4');
  });

  it('knows the CVC length', () => {
    expect(cvcLength('amex')).toBe(4);
    expect(cvcLength('visa')).toBe(3);
    expect(cvcLength(null)).toBe(3);
  });

  it('treats a card as valid through the end of its expiry month', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    expect(isExpired(10, 2026, now)).toBe(false);
    expect(isExpired(9, 2026, now)).toBe(true);
    expect(isExpired(1, 2027, now)).toBe(false);
    expect(isExpired(13, 2030, now)).toBe(true);
    expect(normalizeExpYear(29)).toBe(2029);
    expect(normalizeExpYear(2031)).toBe(2031);
  });
});
