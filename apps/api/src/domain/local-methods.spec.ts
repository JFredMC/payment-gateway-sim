import { isColombianMobile, maskPhone, pseBankByCode, PSE_BANKS } from './local-methods';

describe('local payment methods', () => {
  it('finds PSE banks by code', () => {
    expect(pseBankByCode(PSE_BANKS[0].code)).toEqual(PSE_BANKS[0]);
    expect(pseBankByCode('9999')).toBeNull();
  });

  it('validates and masks Colombian mobile numbers', () => {
    expect(isColombianMobile('3001234567')).toBe(true);
    expect(isColombianMobile('6011234567')).toBe(false);
    expect(isColombianMobile('300123456')).toBe(false);
    expect(maskPhone('3001234567')).toBe('300 ••• 4567');
  });
});
