import { expect, type Page, test } from '@playwright/test';
import { checkoutPath, createIntentViaApi, createMerchantViaApi } from './api';
import { cop, loginInUi, navTo, registerInUi } from './helpers';

async function payWithCard(page: Page, number: string) {
  await page.getByLabel('Número de tarjeta').fill(number);
  await page.getByLabel('Vencimiento', { exact: true }).fill('12/34');
  await page.getByLabel('CVC', { exact: true }).fill('123');
  await page.getByLabel('Nombre en la tarjeta').fill('Ana Gómez');
  await page.getByTestId('pay').click();
}

test.describe('Merchant dashboard', () => {
  test('creates a payment, pays it in the checkout, refunds part of it and inspects webhooks', async ({
    page,
  }) => {
    await registerInUi(page, 'Librería El Faro');

    // 1. A webhook endpoint first, so the payment events get delivered to it.
    // The host never resolves: deliveries fail and stay in the log with retries.
    await navTo(page, 'Webhooks');
    await page.getByRole('button', { name: 'Agregar endpoint' }).click();
    await page.getByLabel('URL del endpoint').fill('no-es-una-url');
    await page.getByRole('button', { name: 'Guardar endpoint' }).click();
    await expect(page.getByText('Ingresa una URL válida (https://…).')).toBeVisible();
    await page.getByLabel('URL del endpoint').fill('https://tienda.invalid/webhooks/pasarela');
    await page.getByLabel('Descripción (opcional)').fill('Servidor de la tienda');
    await page.getByRole('button', { name: 'Guardar endpoint' }).click();
    const endpoint = page.getByTestId('endpoints').locator('li').first();
    await expect(endpoint).toContainText('https://tienda.invalid/webhooks/pasarela');
    await expect(endpoint.getByTestId('endpoint-secret')).toContainText('whsec_');

    // 2. Create a payment and pay it with the 4242 test card.
    await navTo(page, 'Pagos');
    await page.getByRole('link', { name: 'Crear pago' }).click();
    await page.getByLabel('Monto (COP)').fill('120000');
    await page.getByLabel('Descripción').fill('Colección de novelas');
    await page.getByRole('button', { name: 'Crear pago' }).click();
    await expect(page.getByTestId('payment-created')).toContainText(cop('120.000'));
    const link = await page.getByTestId('open-checkout').getAttribute('href');
    expect(link).toMatch(/\/checkout\/pi_[^?]+\?secret=/);

    await page.goto(link!);
    await expect(page.getByTestId('checkout-merchant')).toHaveText('Librería El Faro');
    await payWithCard(page, '4242424242424242');
    await expect(page.getByTestId('checkout-result')).toContainText('¡Pago exitoso!');

    // 3. The payment shows up in the list and its detail.
    await page.goto('/pagos');
    const table = page.getByTestId('payments-table');
    await expect(table).toContainText('Colección de novelas');
    await expect(table).toContainText('Exitoso');
    await table.getByRole('link', { name: cop('120.000') }).click();
    await expect(page.getByTestId('detail-status')).toHaveText('Exitoso');
    await expect(page.getByTestId('detail-method')).toContainText('Visa •••• 4242');
    const timeline = page.getByTestId('timeline');
    await expect(timeline).toContainText('Pago creado');
    await expect(timeline).toContainText('Pago exitoso');

    // 4. Partial refund.
    await page.getByRole('button', { name: 'Reembolsar' }).click();
    await page.getByLabel('Monto a reembolsar (COP)').fill('200000');
    await page.getByRole('button', { name: 'Confirmar reembolso' }).click();
    await expect(page.locator('.field-error')).toBeVisible();
    await page.getByLabel('Monto a reembolsar (COP)').fill('20000');
    await page.getByLabel('Motivo (opcional)').selectOption({ label: 'Solicitado por el cliente' });
    await page.getByRole('button', { name: 'Confirmar reembolso' }).click();
    await expect(page.getByText(/Reembolso de \$\s?20\.000 creado\./)).toBeVisible();
    await expect(page.getByText(/Reembolso parcial/)).toBeVisible();
    await expect(page.getByTestId('refunds')).toContainText(cop('20.000'));
    await expect(timeline).toContainText('Reembolso creado');
    await expect(page.getByTestId('payment-deliveries')).toContainText('Pago exitoso');

    // Deep link survives a reload.
    await page.reload();
    await expect(page.getByTestId('detail-status')).toHaveText('Exitoso');

    // 5. Webhook delivery log: payload + manual retry.
    await navTo(page, 'Webhooks');
    const deliveries = page.getByTestId('deliveries');
    const succeeded = deliveries.locator('li').filter({ hasText: 'Pago exitoso' }).first();
    await expect(succeeded).toBeVisible();
    await succeeded.getByRole('button').first().click();
    const detail = page.getByTestId('delivery-detail');
    await expect(detail.getByTestId('delivery-payload')).toContainText('payment_intent.succeeded');
    await detail.getByRole('button', { name: 'Reenviar ahora' }).click();
    await expect(detail).toContainText('(manual)');
    await expect(detail).toContainText('No se pudo conectar con el endpoint');
  });

  test('home KPIs, status filter and declined attempts', async ({ page, request }) => {
    const merchant = await createMerchantViaApi(request, 'Panadería San Jorge');
    const paid = await createIntentViaApi(request, merchant, {
      amount: 5_000_000,
      description: 'Torta de cumpleaños',
    });
    await createIntentViaApi(request, merchant, { amount: 1_500_000, description: 'Pan de bono' });

    await page.goto(checkoutPath(paid));
    await payWithCard(page, '4000000000000002');
    await expect(page.getByTestId('decline')).toBeVisible();
    await payWithCard(page, '5555555555554444');
    await expect(page.getByTestId('checkout-result')).toContainText('¡Pago exitoso!');

    await loginInUi(page, merchant.email);
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByTestId('kpi-gross')).toContainText(cop('50.000'));
    await expect(page.getByTestId('kpi-approval')).toContainText('50');
    await expect(page.getByTestId('recent-payments')).toContainText('Pan de bono');

    await navTo(page, 'Pagos');
    await page.getByRole('button', { name: 'Exitosos' }).click();
    await expect(page).toHaveURL(/estado=succeeded/);
    const table = page.getByTestId('payments-table');
    await expect(table).toContainText('Torta de cumpleaños');
    await expect(table).not.toContainText('Pan de bono');
    await page.reload();
    await expect(table).not.toContainText('Pan de bono');

    await table.getByRole('link', { name: cop('50.000') }).click();
    await expect(page.getByTestId('timeline')).toContainText('Intento de pago fallido');
  });

  test('cancels a pending payment', async ({ page, request }) => {
    const merchant = await createMerchantViaApi(request);
    const intent = await createIntentViaApi(request, merchant, { description: 'Reserva' });
    await loginInUi(page, merchant.email);
    await expect(page).toHaveURL(/\/inicio$/);
    await page.goto(`/pagos/${intent.id}`);
    await expect(page.getByTestId('detail-status')).toHaveText('Pendiente de pago');
    await page.getByRole('button', { name: 'Cancelar pago' }).click();
    await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
    await expect(page.getByTestId('detail-status')).toHaveText('Cancelado');
    await expect(page.getByRole('button', { name: 'Cancelar pago' })).toHaveCount(0);

    await page.goto(checkoutPath(intent));
    await expect(page.getByTestId('checkout-result')).toContainText('cancelado');
  });

  test('shows the API keys and rolls the secret key', async ({ page }) => {
    await registerInUi(page, 'Ferretería Los Andes');
    await navTo(page, 'Claves API');
    await expect(page.getByTestId('publishable-key')).toContainText('pk_test_');
    await expect(page.getByTestId('secret-key')).toContainText('sk_test_');
    await page.getByRole('button', { name: 'Rotar llave secreta' }).click();
    await page.getByRole('button', { name: 'Sí, rotar llave' }).click();
    await expect(page.getByTestId('revealed-secret')).toContainText(/sk_test_\w{20,}/);
  });
});
