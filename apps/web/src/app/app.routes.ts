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
    ],
  },
  {
    path: '**',
    title: 'No encontrada · Pasarela',
    loadComponent: () => import('./features/not-found.page').then((m) => m.NotFoundPage),
  },
];
