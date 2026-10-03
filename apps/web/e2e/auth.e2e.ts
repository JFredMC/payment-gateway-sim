import { expect, test } from '@playwright/test';
import { loginInUi, registerInUi } from './helpers';

test('a merchant signs up, keeps the session on reload, logs out and back in', async ({ page }) => {
  const email = await registerInUi(page, 'Café La Montaña');
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
  await expect(page.getByTestId('business-name')).toHaveText('Café La Montaña');
  await expect(page.getByText('Modo test', { exact: true })).toBeVisible();

  // The access token lives in memory only: a reload restores it from the refresh cookie.
  await page.reload();
  await expect(page.getByTestId('business-name')).toHaveText('Café La Montaña');

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/ingresar$/);

  await loginInUi(page, email, 'Wrong-pass1');
  await expect(page.getByTestId('problem')).toContainText('Correo o contraseña incorrectos');

  await loginInUi(page, email);
  await expect(page).toHaveURL(/\/inicio$/);
});
