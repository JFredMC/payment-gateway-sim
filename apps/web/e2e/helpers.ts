/** Matches a COP amount regardless of the (non-breaking) space after "$". */
export const cop = (pesos: string) => new RegExp(`\\$\\s?${pesos.replace(/\./g, '\\.')}`);

export const uniqueEmail = (prefix: string) =>
  `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
