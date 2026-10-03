import { Pipe, type PipeTransform } from '@angular/core';
import { formatDateTime } from '../utils/dates';

/** `{{ payment.created_at | dateTime }}` → "2 oct 2026, 3:15 p. m." (browser time zone). */
@Pipe({ name: 'dateTime' })
export class DateTimePipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    return iso ? formatDateTime(iso) : '';
  }
}
