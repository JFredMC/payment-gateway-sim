import {
  BRANDS,
  type CardBrand,
  cvcLength,
  detectBrand,
  formatPan,
  isExpired,
  maxPanLength,
  normalizePan,
  normalizeExpYear,
  panProblem,
} from '../../domain/cards';

/** Pure helpers behind the card form (kept out of the component to unit-test them). */

export const PAN_MESSAGES: Record<string, string> = {
  required: 'Ingresa el número de la tarjeta.',
  incomplete: 'El número de la tarjeta está incompleto.',
  unknown_brand: 'No reconocemos la franquicia de esta tarjeta.',
  invalid_length: 'El número no tiene la longitud correcta para esta franquicia.',
  invalid_checksum: 'El número de la tarjeta no es válido.',
};

/** What the user typed → digits only, cut to the brand's maximum length, grouped. */
export function formatPanInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const brand = detectBrand(digits);
  return formatPan(digits.slice(0, maxPanLength(brand)));
}

export function panError(value: string): string | null {
  const pan = normalizePan(value);
  if (pan === '') return PAN_MESSAGES['required'];
  const problem = panProblem(pan);
  return problem ? PAN_MESSAGES[problem] : null;
}

export function brandOf(value: string): CardBrand | null {
  return detectBrand(normalizePan(value));
}

export function brandLabel(brand: CardBrand | null): string {
  return brand ? BRANDS[brand].label : '';
}

/** "1", "12", "122", "1229" → "1", "12", "12/2", "12/29". */
export function formatExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function parseExpiry(value: string): { month: number; year: number } | null {
  const match = /^(\d{2})\s*\/\s*(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;
  return { month, year: normalizeExpYear(Number(match[2])) };
}

export function expiryError(value: string, now: Date): string | null {
  if (value.trim() === '') return 'Ingresa la fecha de vencimiento.';
  const parsed = parseExpiry(value);
  if (!parsed) return 'Usa el formato MM/AA.';
  return isExpired(parsed.month, parsed.year, now) ? 'La tarjeta está vencida.' : null;
}

export function cvcError(value: string, brand: CardBrand | null): string | null {
  const length = cvcLength(brand);
  if (value.trim() === '') return 'Ingresa el código de seguridad.';
  return new RegExp(`^\\d{${length}}$`).test(value)
    ? null
    : `El código de seguridad debe tener ${length} dígitos.`;
}
