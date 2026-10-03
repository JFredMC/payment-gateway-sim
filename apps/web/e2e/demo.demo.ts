import { expect, type Page, test } from '@playwright/test';
import { cop } from './helpers';

/**
 * GitHub Pages demo: the whole app runs against the in-browser backend
 * (localStorage). Paths are relative to the base href (/payment-gateway-sim/).
 */

async function loginAsDemoMerchant(page: Page) {
  await page.goto('ingresar');
  await expect(page.getByTestId('demo-banner')).toContainText('Modo demo · datos simulados');
  const hint = page.getByTestId('demo-hint');
  await expect(hint).toContainText('ana@tienda-aurora.demo');
  await hint.getByRole('button', { name: 'Usar' }).click();
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

async function payWithCard(page: Page, number: string) {
  await page.getByLabel('Número de tarjeta').fill(number);
  await page.getByLabel('Vencimiento', { exact: true }).fill('12/34');
  await page.getByLabel('CVC', { exact: true }).fill(number.length === 15 ? '1234' : '123');
  await page.getByLabel('Nombre en la tarjeta').fill('Ana Gómez');
  await page.getByTestId('pay').click();
}

test.beforeEach(async ({ page }) => {
  // Every test starts from the sample data.
  await page.goto('ingresar');
  await page.evaluate(() => localStorage.clear());
});

test('the sample merchant comes with a month of payments and webhooks', async ({ page }) => {
  await loginAsDemoMerchant(page);
  await expect(page.getByTestId('business-name')).toHaveText('Tienda Aurora');
  await expect(page.getByTestId('demo-banner')).toContainText('Restablecer demo');
  await expect(page.getByTestId('kpi-gross')).not.toContainText(/\$\s?0$/);
  await page.getByRole('button', { name: '30 días' }).click();
  await expect(page.getByTestId('kpi-approval')).toContainText('%');
  await expect(page.getByTestId('recent-payments')).toContainText('Pedido #1044');

  await page.goto('pagos?estado=requires_action');
  await expect(page.getByTestId('payments-table')).toContainText('Lámpara de escritorio');

  await page.goto('desarrolladores/webhooks');
  await expect(page.getByTestId('webhooks-demo-note')).toBeVisible();
  await expect(page.getByTestId('endpoints')).toContainText(
    'https://tienda-aurora.example/webhooks/pasarela',
  );
  const deliveries = page.getByTestId('deliveries');
  await expect(deliveries).toContainText('Entregado');
  await page.getByRole('button', { name: 'Fallidas' }).click();
  await expect(deliveries).toContainText('HTTP 500');
});

test('create a payment, decline + 3DS in the checkout, refund and follow the webhooks', async ({
  page,
}) => {
  await loginAsDemoMerchant(page);
  await page.goto('pagos/nuevo');
  await page.getByLabel('Monto (COP)').fill('150000');
  await page.getByLabel('Descripción').fill('Pedido demo');
  await page.getByRole('button', { name: 'Crear pago' }).click();
  const link = await page.getByTestId('open-checkout').getAttribute('href');
  expect(link).toContain('/payment-gateway-sim/checkout/pi_');
  const id = /checkout\/(pi_[0-9A-Za-z]+)/.exec(link!)![1];

  await page.goto(link!);
  await expect(page.getByTestId('checkout-merchant')).toHaveText('Tienda Aurora');
  await expect(page.getByTestId('checkout-amount')).toHaveText(cop('150.000'));
  await payWithCard(page, '4000000000000002');
  await expect(page.getByTestId('decline')).toContainText('Tu tarjeta fue rechazada');
  await payWithCard(page, '4000002760003184');
  await expect(page.getByTestId('challenge')).toBeVisible();
  await page.getByRole('button', { name: 'Autorizar pago' }).click();
  await expect(page.getByTestId('checkout-result')).toContainText('¡Pago exitoso!');

  await page.goto(`pagos/${id}`);
  await expect(page.getByTestId('detail-status')).toHaveText('Exitoso');
  const timeline = page.getByTestId('timeline');
  await expect(timeline).toContainText('Intento de pago fallido');
  await expect(timeline).toContainText('Esperando autenticación del comprador');
  await page.getByRole('button', { name: 'Reembolsar' }).click();
  await page.getByLabel('Monto a reembolsar (COP)').fill('50000');
  await page.getByRole('button', { name: 'Confirmar reembolso' }).click();
  await expect(page.getByText(/Reembolso parcial/)).toBeVisible();
  await expect(page.getByTestId('payment-deliveries')).toContainText('Entregado');
  await page.reload();
  await expect(page.getByTestId('detail-status')).toHaveText('Exitoso');
  await expect(page.getByTestId('refunds')).toContainText(cop('50.000'));

  // The ERP endpoint of the sample data always answers 500: the refund is retried.
  await page.goto('desarrolladores/webhooks');
  const deliveries = page.getByTestId('deliveries');
  await expect(deliveries).toContainText('Entregado');
  await page.getByRole('button', { name: 'Pendientes' }).click();
  await expect(deliveries).not.toContainText('Entregado');
  const pending = deliveries.locator('li').filter({ hasText: 'Reembolso creado' }).first();
  await pending.getByRole('button').first().click();
  const detail = page.getByTestId('delivery-detail');
  await expect(detail).toContainText('HTTP 500');
  await expect(detail).toContainText('Próximo intento');
  await detail.getByRole('button', { name: 'Reenviar ahora' }).click();
  await expect(detail).toContainText('(manual)');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
});

test('a new merchant starts empty and "Restablecer demo" restores the sample data', async ({
  page,
}) => {
  await page.goto('registro');
  await page.getByLabel('Nombre del comercio').fill('Panadería Demo');
  await page.getByLabel('Tu nombre completo').fill('Luis Pérez');
  await page.getByLabel('Correo electrónico').fill('luis@panaderia.demo');
  await page.getByLabel('Contraseña').fill('Demo12345');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByTestId('business-name')).toHaveText('Panadería Demo');
  await expect(page.getByTestId('kpi-gross')).toContainText(cop('0'));

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Restablecer demo' }).click();
  await expect(page).toHaveURL(/\/ingresar\?demo=restablecida$/);
  await expect(page.getByRole('status')).toContainText('la demo volvió a sus datos iniciales');

  await page.getByLabel('Correo electrónico').fill('luis@panaderia.demo');
  await page.getByLabel('Contraseña').fill('Demo12345');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByTestId('problem')).toContainText('Correo o contraseña incorrectos');
});
