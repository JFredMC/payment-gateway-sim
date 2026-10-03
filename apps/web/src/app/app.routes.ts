import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Pasarela de pagos simulada',
    loadComponent: () => import('./features/status/status.page').then((m) => m.StatusPage),
  },
  {
    path: '**',
    title: 'No encontrada · Pasarela',
    loadComponent: () => import('./features/not-found.page').then((m) => m.NotFoundPage),
  },
];
