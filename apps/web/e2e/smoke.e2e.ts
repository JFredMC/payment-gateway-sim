import { expect, test } from '@playwright/test';

test('the status page reaches the API through the proxy', async ({ page }) => {
  await page.goto('/estado');
  await expect(page.getByRole('heading', { name: 'Pasarela de pagos simulada' })).toBeVisible();
  await expect(page.getByTestId('api-status')).toHaveText(/API disponible/);
});

test('private pages redirect to login', async ({ page }) => {
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/ingresar\?returnUrl=%2Finicio$/);
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
});
