import { expect, type Page, test } from '@playwright/test';
import { checkoutPath, createIntentViaApi, createMerchantViaApi, refundViaApi } from './api';
import { cop } from './helpers';

async function fillCard(page: Page, number: string, expiry = '12/34', cvc = '123') {
  await page.getByLabel('Número de tarjeta').fill(number);
  await page.getByLabel('Vencimiento', { exact: true }).fill(expiry);
  await page.getByLabel('CVC', { exact: true }).fill(cvc);
  await page.getByLabel('Nombre en la tarjeta').fill('Ana Gómez');
}

const payButton = (page: Page) => page.getByTestId('pay');

test.describe('Hosted checkout', () => {
  test('pays with 4242: live brand detection, success page, survives a reload', async ({
    page,
    request,
  }) => {
    const merchant = await createMerchantViaApi(request, 'Tienda Aurora');
    const intent = await createIntentViaApi(request, merchant, {
      return_url: 'https://example.com/gracias',
    });

    await page.goto(checkoutPath(intent));
    await expect(page.getByTestId('checkout-merchant')).toHaveText('Tienda Aurora');
    await expect(page.getByTestId('checkout-amount')).toHaveText(cop('89.900'));

    await page.getByLabel('Número de tarjeta').fill('4242424242424242');
    await expect(page.getByLabel('Número de tarjeta')).toHaveValue('4242 4242 4242 4242');
    await expect(page.getByTestId('card-brand')).toHaveText('Visa');
    await fillCard(page, '4242424242424242');
    await payButton(page).click();

    const result = page.getByTestId('checkout-result');
    await expect(result).toContainText('¡Pago exitoso!');
    await expect(page.getByTestId('checkout-paid-with')).toContainText('Visa •••• 4242');
    await expect(page.getByRole('link', { name: 'Volver al comercio' })).toHaveAttribute(
      'href',
      'https://example.com/gracias',
    );

    await refundViaApi(request, merchant, intent.id, 1_000_000);
    await page.reload();
    await expect(result).toContainText('¡Pago exitoso!');
    await expect(result).toContainText(cop('10.000'));
  });

  test('validates the card form client-side (Luhn, expiry, CVC length for Amex)', async ({
    page,
    request,
  }) => {
    const merchant = await createMerchantViaApi(request);
    const intent = await createIntentViaApi(request, merchant);
    await page.goto(checkoutPath(intent));

    await fillCard(page, '4242424242424241', '01/20', '12');
    await payButton(page).click();
    await expect(page.getByText('El número de la tarjeta no es válido.')).toBeVisible();
    await expect(page.getByText('La tarjeta está vencida.')).toBeVisible();

    await page.getByLabel('Número de tarjeta').fill('378282246310005');
    await expect(page.getByTestId('card-brand')).toHaveText('American Express');
    await expect(page.getByLabel('Número de tarjeta')).toHaveValue('3782 822463 10005');
    await expect(page.getByText('El código de seguridad debe tener 4 dígitos.')).toBeVisible();
  });

  test('a declined card shows the reason in Spanish and allows another attempt', async ({
    page,
    request,
  }) => {
    const merchant = await createMerchantViaApi(request);
    const intent = await createIntentViaApi(request, merchant);
    await page.goto(checkoutPath(intent));

    await fillCard(page, '4000000000009995');
    await payButton(page).click();
    const decline = page.getByTestId('decline');
    await expect(decline).toContainText('La tarjeta no tiene fondos suficientes.');
    await expect(decline).toContainText('Te quedan 2 intentos.');

    // Retry with the test-card helper.
    await page.getByTestId('test-cards').locator('summary').click();
    await page.getByRole('button', { name: 'Usar tarjeta Pago aprobado (Mastercard)' }).click();
    await expect(page.getByTestId('card-brand')).toHaveText('Mastercard');
    await payButton(page).click();
    await expect(page.getByTestId('checkout-result')).toContainText('¡Pago exitoso!');
    await expect(page.getByTestId('checkout-paid-with')).toContainText('Mastercard •••• 4444');
  });

  test('3-D Secure: rejecting the challenge fails the attempt, approving it succeeds', async ({
    page,
    request,
  }) => {
    const merchant = await createMerchantViaApi(request);
    const intent = await createIntentViaApi(request, merchant);
    await page.goto(checkoutPath(intent));

    await fillCard(page, '4000002760003184');
    await payButton(page).click();
    const challenge = page.getByTestId('challenge');
    await expect(challenge).toContainText('Autenticación 3D Secure');
    await expect(challenge).toContainText('Visa •••• 3184');

    // The challenge survives a reload (state lives in the API).
    await page.reload();
    await page.getByRole('button', { name: 'Rechazar autenticación' }).click();
    await expect(page.getByTestId('decline')).toContainText('No se pudo autenticar el pago.');

    await fillCard(page, '4000002760003184');
    await payButton(page).click();
    await page.getByRole('button', { name: 'Autorizar pago' }).click();
    await expect(page.getByTestId('checkout-result')).toContainText('¡Pago exitoso!');
  });

  test('three declines exhaust the attempts', async ({ page, request }) => {
    const merchant = await createMerchantViaApi(request);
    const intent = await createIntentViaApi(request, merchant);
    await page.goto(checkoutPath(intent));

    for (const attempt of [1, 2, 3]) {
      await fillCard(page, '4000000000000002');
      await payButton(page).click();
      if (attempt < 3) await expect(page.getByTestId('decline')).toContainText(`${3 - attempt}`);
    }
    await expect(page.getByTestId('checkout-result')).toContainText('Pago no completado');
  });

  test('PSE: choose a bank, approve on the simulated bank portal', async ({ page, request }) => {
    const merchant = await createMerchantViaApi(request);
    const intent = await createIntentViaApi(request, merchant);
    await page.goto(checkoutPath(intent));

    await page.getByRole('tab', { name: 'PSE' }).click();
    await payButton(page).click();
    await expect(page.getByText('Selecciona tu banco.', { exact: true })).toBeVisible();
    await page
      .getByLabel('Banco', { exact: true })
      .selectOption({ label: 'Banco Caribe de Prueba' });
    await page.getByLabel('Persona jurídica').check();
    await payButton(page).click();

    await expect(page.getByTestId('challenge')).toContainText('Banco Caribe de Prueba');
    await page.getByRole('button', { name: 'Aprobar pago' }).click();
    await expect(page.getByTestId('checkout-paid-with')).toContainText(
      'PSE · Banco Caribe de Prueba',
    );
  });

  test('Nequi: rejecting the push leaves the payment pending', async ({ page, request }) => {
    const merchant = await createMerchantViaApi(request);
    const intent = await createIntentViaApi(request, merchant);
    await page.goto(checkoutPath(intent));

    await page.getByRole('tab', { name: 'Nequi' }).click();
    await page.getByLabel('Celular registrado en Nequi').fill('123');
    await payButton(page).click();
    await expect(
      page.getByText('Ingresa un celular colombiano de 10 dígitos (3XX).'),
    ).toBeVisible();
    await page.getByLabel('Celular registrado en Nequi').fill('300 123 4567');
    await payButton(page).click();

    await expect(page.getByTestId('challenge')).toContainText('••• 4567');
    await page.getByRole('button', { name: 'Rechazar pago' }).click();
    await expect(page.getByTestId('decline')).toContainText(
      'El pago fue rechazado en el banco o en la aplicación.',
    );
  });

  test('a link without a valid secret shows a friendly error', async ({ page }) => {
    await page.goto('/checkout/pi_doesnotexist?secret=nope');
    await expect(page.getByTestId('checkout-invalid')).toContainText('Enlace de pago no válido');
  });
});
