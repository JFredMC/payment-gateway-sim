import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BadgeTone } from '../utils/payments';

@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="classes()"><ng-content /></span>`,
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
  protected readonly classes = computed(() =>
    this.tone() === 'neutral' ? 'badge' : `badge badge-${this.tone()}`,
  );
}
