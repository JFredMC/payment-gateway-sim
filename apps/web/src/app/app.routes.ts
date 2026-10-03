import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { ShellComponent } from './core/layout/shell.component';

export const routes: Routes = [
  {
    path: 'ingresar',
    title: 'Ingresar · Pasarela',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'registro',
    title: 'Registrar comercio · Pasarela',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'estado',
    title: 'Estado del servicio · Pasarela',
    loadComponent: () => import('./features/status/status.page').then((m) => m.StatusPage),
  },
  {
    // Public hosted checkout: authorized by the intent's client secret (?secret=…).
    path: 'checkout/:id',
    title: 'Pagar · Pasarela',
    loadComponent: () => import('./features/checkout/checkout.page').then((m) => m.CheckoutPage),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio · Pasarela',
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'pagos',
        title: 'Pagos · Pasarela',
        loadComponent: () =>
          import('./features/payments/payments.page').then((m) => m.PaymentsPage),
      },
      {
        path: 'pagos/nuevo',
        title: 'Crear pago · Pasarela',
        loadComponent: () =>
          import('./features/payments/new-payment.page').then((m) => m.NewPaymentPage),
      },
      {
        path: 'pagos/:id',
        title: 'Detalle del pago · Pasarela',
        loadComponent: () =>
          import('./features/payments/payment-detail.page').then((m) => m.PaymentDetailPage),
      },
      {
        path: 'desarrolladores/claves',
        title: 'Claves API · Pasarela',
        loadComponent: () =>
          import('./features/developers/api-keys.page').then((m) => m.ApiKeysPage),
      },
      {
        path: 'desarrolladores/webhooks',
        title: 'Webhooks · Pasarela',
        loadComponent: () =>
          import('./features/developers/webhooks.page').then((m) => m.WebhooksPage),
      },
    ],
  },
  {
    path: '**',
    title: 'No encontrada · Pasarela',
    loadComponent: () => import('./features/not-found.page').then((m) => m.NotFoundPage),
  },
];
