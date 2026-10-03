import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { IconComponent } from './icon.component';

/** Copies a value to the clipboard and confirms it for 2 s. */
@Component({
  selector: 'app-copy-button',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      [attr.aria-label]="copied() ? 'Copiado' : label()"
      (click)="copy()"
    >
      <app-icon [name]="copied() ? 'check' : 'copy'" [size]="14" />
      <span>{{ copied() ? 'Copiado' : text() }}</span>
    </button>
  `,
})
export class CopyButtonComponent {
  readonly value = input.required<string>();
  readonly label = input('Copiar');
  readonly text = input('Copiar');
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.value());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard unavailable (permissions / insecure context): the value is visible anyway.
    }
  }
}
