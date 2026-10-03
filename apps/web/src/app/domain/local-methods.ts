/** Simulated Colombian payment methods: PSE (bank redirect) and Nequi (push approval). */

export interface PseBank {
  code: string;
  name: string;
}

/** Fictitious banks: every PSE payment ends on a simulated bank page. */
export const PSE_BANKS: readonly PseBank[] = [
  { code: '1001', name: 'Banco Andino de Prueba' },
  { code: '1002', name: 'Banco Caribe de Prueba' },
  { code: '1003', name: 'Banco Pacífico de Prueba' },
  { code: '1004', name: 'Cooperativa Llanera de Prueba' },
];

export const PSE_PERSON_TYPES = ['natural', 'juridica'] as const;
export type PsePersonType = (typeof PSE_PERSON_TYPES)[number];

export function pseBankByCode(code: string): PseBank | null {
  return PSE_BANKS.find((bank) => bank.code === code) ?? null;
}

/** Colombian mobile number: 10 digits starting with 3. */
export function isColombianMobile(phone: string): boolean {
  return /^3\d{9}$/.test(phone);
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)} ••• ${phone.slice(-4)}`;
}
