import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DemoBannerComponent } from '../../shared/ui/demo-banner.component';
import { IconComponent, type IconName } from '../../shared/ui/icon.component';
import { AuthService } from '../auth/auth.service';

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/inicio', label: 'Inicio', icon: 'home' },
  { path: '/pagos', label: 'Pagos', icon: 'list' },
  { path: '/desarrolladores/claves', label: 'Claves API', icon: 'key' },
  { path: '/desarrolladores/webhooks', label: 'Webhooks', icon: 'webhook' },
];

/** Merchant dashboard layout: top bar on desktop, bottom tab bar on mobile. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, DemoBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly nav = NAV_ITEMS;

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}
