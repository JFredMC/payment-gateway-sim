import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Playwright-pass1';

/** Matches a COP amount regardless of the (non-breaking) space after "$". */
export const cop = (pesos: string) => new RegExp(`\\$\\s?${pesos.replace(/\./g, '\\.')}`);

export const uniqueEmail = (prefix: string) =>
  `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;

export async function registerInUi(
  page: Page,
  businessName: string,
  fullName = 'Ana Gómez',
  email = uniqueEmail('ui'),
) {
  await page.goto('/registro');
  await page.getByLabel('Nombre del comercio').fill(businessName);
  await page.getByLabel('Tu nombre completo').fill(fullName);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  return email;
}

export async function loginInUi(page: Page, email: string, password = PASSWORD) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** The visible main navigation (top bar on desktop, tab bar on mobile). */
export function navTo(page: Page, label: string) {
  return page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: label })
    .click();
}
