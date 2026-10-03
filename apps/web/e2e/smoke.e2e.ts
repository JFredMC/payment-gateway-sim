import { expect, test } from '@playwright/test';

test('the SPA loads and reaches the API through the proxy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pasarela de pagos simulada' })).toBeVisible();
  await expect(page.getByTestId('api-status')).toHaveText(/API disponible/);
});

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('/no-existe');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});
