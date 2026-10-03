import {
  brandOf,
  cvcError,
  expiryError,
  formatExpiryInput,
  formatPanInput,
  panError,
  parseExpiry,
} from './card-form';

const now = new Date('2026-10-02T12:00:00Z');

describe('card form helpers', () => {
  it('formats the number while typing, cut to the brand length', () => {
    expect(formatPanInput('4242424242424242999')).toBe('4242 4242 4242 4242 999');
    expect(formatPanInput('5555-5555-5555-44449')).toBe('5555 5555 5555 4444');
    expect(formatPanInput('3782822463100059')).toBe('3782 822463 10005');
    expect(formatPanInput('42a4')).toBe('424');
  });

  it('explains what is wrong with the number in Spanish', () => {
    expect(panError('')).toBe('Ingresa el número de la tarjeta.');
    expect(panError('4242 4242')).toBe('El número de la tarjeta está incompleto.');
    expect(panError('9999 9999 9999 9999')).toBe('No reconocemos la franquicia de esta tarjeta.');
    expect(panError('4242 4242 4242 4241')).toBe('El número de la tarjeta no es válido.');
    expect(panError('4242 4242 4242 4242')).toBeNull();
    expect(brandOf('3782 8224')).toBe('amex');
  });

  it('formats and validates the expiry date', () => {
    expect(formatExpiryInput('1229')).toBe('12/29');
    expect(formatExpiryInput('1')).toBe('1');
    expect(parseExpiry('12/29')).toEqual({ month: 12, year: 2029 });
    expect(parseExpiry('13/29')).toBeNull();
    expect(expiryError('', now)).toBe('Ingresa la fecha de vencimiento.');
    expect(expiryError('1/2', now)).toBe('Usa el formato MM/AA.');
    expect(expiryError('09/26', now)).toBe('La tarjeta está vencida.');
    expect(expiryError('10/26', now)).toBeNull();
  });

  it('checks the CVC length for the brand', () => {
    expect(cvcError('123', 'visa')).toBeNull();
    expect(cvcError('123', 'amex')).toBe('El código de seguridad debe tener 4 dígitos.');
    expect(cvcError('', null)).toBe('Ingresa el código de seguridad.');
  });
});
