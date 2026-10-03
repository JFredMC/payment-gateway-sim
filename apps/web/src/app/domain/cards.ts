/** Card number rules: normalization, Luhn, brand detection and formatting. */

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'diners' | 'discover';

export interface BrandSpec {
  brand: CardBrand;
  label: string;
  lengths: readonly number[];
  cvcLength: number;
  /** Digit groups used to display the number (4-4-4-4, 4-6-5, …). */
  gaps: readonly number[];
}

export const BRANDS: Record<CardBrand, BrandSpec> = {
  visa: {
    brand: 'visa',
    label: 'Visa',
    lengths: [13, 16, 19],
    cvcLength: 3,
    gaps: [4, 8, 12, 16],
  },
  mastercard: {
    brand: 'mastercard',
    label: 'Mastercard',
    lengths: [16],
    cvcLength: 3,
    gaps: [4, 8, 12],
  },
  amex: { brand: 'amex', label: 'American Express', lengths: [15], cvcLength: 4, gaps: [4, 10] },
  diners: {
    brand: 'diners',
    label: 'Diners Club',
    lengths: [14, 16],
    cvcLength: 3,
    gaps: [4, 10],
  },
  discover: {
    brand: 'discover',
    label: 'Discover',
    lengths: [16, 19],
    cvcLength: 3,
    gaps: [4, 8, 12, 16],
  },
};

/** Strips spaces and dashes. Returns '' when anything else than digits remains. */
export function normalizePan(input: string): string {
  const compact = input.replace(/[\s-]/g, '');
  return /^\d*$/.test(compact) ? compact : '';
}

/** Luhn (mod 10) checksum. */
export function luhnValid(pan: string): boolean {
  if (!/^\d{12,19}$/.test(pan)) return false;
  let sum = 0;
  let double = false;
  for (let i = pan.length - 1; i >= 0; i--) {
    let digit = pan.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Brand from the leading digits (IIN ranges). Works on partial numbers while typing. */
export function detectBrand(pan: string): CardBrand | null {
  if (/^4/.test(pan)) return 'visa';
  if (/^3[47]/.test(pan)) return 'amex';
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(pan)) return 'mastercard';
  if (/^(36|30[0-5]|3095|38|39)/.test(pan)) return 'diners';
  if (/^(6011|65|64[4-9]|622)/.test(pan)) return 'discover';
  return null;
}

export type PanProblem = 'incomplete' | 'unknown_brand' | 'invalid_length' | 'invalid_checksum';

/** Full validation of a normalized PAN. Returns null when the number is acceptable. */
export function panProblem(pan: string): PanProblem | null {
  if (pan.length < 12) return 'incomplete';
  const brand = detectBrand(pan);
  if (!brand) return 'unknown_brand';
  if (!BRANDS[brand].lengths.includes(pan.length)) return 'invalid_length';
  if (!luhnValid(pan)) return 'invalid_checksum';
  return null;
}

/** Groups digits for display: "4242 4242 4242 4242", "3782 822463 10005". */
export function formatPan(pan: string): string {
  const brand = detectBrand(pan);
  const gaps = brand ? BRANDS[brand].gaps : [4, 8, 12];
  let out = '';
  for (let i = 0; i < pan.length; i++) {
    if (gaps.includes(i)) out += ' ';
    out += pan[i];
  }
  return out;
}

export function maxPanLength(brand: CardBrand | null): number {
  return brand ? Math.max(...BRANDS[brand].lengths) : 19;
}

export function cvcLength(brand: CardBrand | null): number {
  return brand ? BRANDS[brand].cvcLength : 3;
}

/** A card is valid through the last day of its expiry month. `now` is injected for tests. */
export function isExpired(month: number, year: number, now: Date): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return true;
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth);
}

/** Accepts 2- or 4-digit years ("29" → 2029). */
export function normalizeExpYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}
