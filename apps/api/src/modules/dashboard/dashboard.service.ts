import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PaymentMethodType } from '../../domain/payment-intent-state';

/** Business day boundaries follow the merchant's market (Colombia). */
export const DASHBOARD_TIME_ZONE = 'America/Bogota';

export interface DailyPoint {
  date: string;
  volume: number;
  count: number;
}

export interface DashboardSummary {
  object: 'dashboard_summary';
  currency: 'COP';
  period: { days: number; from: string; to: string; time_zone: string };
  gross_volume: number;
  refunded_amount: number;
  net_volume: number;
  succeeded_count: number;
  average_ticket: number;
  /** succeeded / (succeeded + failed attempts) in the period; null without attempts. */
  approval_rate: number | null;
  failed_attempts: number;
  pending_count: number;
  by_method: { type: PaymentMethodType; count: number; volume: number }[];
  daily: DailyPoint[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async summary(merchantId: string, days: number): Promise<DashboardSummary> {
    const params = [merchantId, days, DASHBOARD_TIME_ZONE];
    // Local calendar days of the period, oldest first.
    const periodStart = `(((now() AT TIME ZONE $3)::date - ($2::int - 1))::timestamp AT TIME ZONE $3)`;

    const [daily, totals, events, pending, byMethod] = await Promise.all([
      this.dataSource.query<{ date: string; volume: string; count: string }[]>(
        `WITH days AS (
           SELECT generate_series((now() AT TIME ZONE $3)::date - ($2::int - 1),
                                  (now() AT TIME ZONE $3)::date, interval '1 day')::date AS day)
         SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                COALESCE(SUM(pi.amount), 0) AS volume,
                COUNT(pi.id) AS count
           FROM days d
           LEFT JOIN payment_intents pi
             ON pi.merchant_id = $1 AND pi.status = 'succeeded'
            AND (pi.succeeded_at AT TIME ZONE $3)::date = d.day
          GROUP BY d.day
          ORDER BY d.day`,
        params,
      ),
      this.dataSource.query<{ refunded: string }[]>(
        `SELECT COALESCE(SUM(amount), 0) AS refunded
           FROM refunds WHERE merchant_id = $1 AND created_at >= ${periodStart}`,
        params,
      ),
      this.dataSource.query<{ succeeded: string; failed: string }[]>(
        `SELECT COUNT(*) FILTER (WHERE type = 'payment_intent.succeeded') AS succeeded,
                COUNT(*) FILTER (WHERE type = 'payment_intent.payment_failed') AS failed
           FROM events WHERE merchant_id = $1 AND created_at >= ${periodStart}`,
        params,
      ),
      this.dataSource.query<{ pending: string }[]>(
        `SELECT COUNT(*) AS pending FROM payment_intents
          WHERE merchant_id = $1 AND status IN ('requires_payment_method', 'requires_action')`,
        [merchantId],
      ),
      this.dataSource.query<{ type: PaymentMethodType; count: string; volume: string }[]>(
        `SELECT pm.type, COUNT(*) AS count, SUM(pi.amount) AS volume
           FROM payment_intents pi JOIN payment_methods pm ON pm.id = pi.payment_method_id
          WHERE pi.merchant_id = $1 AND pi.status = 'succeeded' AND pi.succeeded_at >= ${periodStart}
          GROUP BY pm.type ORDER BY SUM(pi.amount) DESC`,
        params,
      ),
    ]);

    const points = daily.map((row) => ({
      date: row.date,
      volume: Number(row.volume),
      count: Number(row.count),
    }));
    const gross = points.reduce((sum, point) => sum + point.volume, 0);
    const count = points.reduce((sum, point) => sum + point.count, 0);
    const refunded = Number(totals[0]?.refunded ?? 0);
    const succeededEvents = Number(events[0]?.succeeded ?? 0);
    const failedEvents = Number(events[0]?.failed ?? 0);
    const attempts = succeededEvents + failedEvents;

    return {
      object: 'dashboard_summary',
      currency: 'COP',
      period: {
        days,
        from: points[0]?.date ?? '',
        to: points.at(-1)?.date ?? '',
        time_zone: DASHBOARD_TIME_ZONE,
      },
      gross_volume: gross,
      refunded_amount: refunded,
      net_volume: gross - refunded,
      succeeded_count: count,
      // Whole pesos: COP amounts are shown without cents.
      average_ticket: count > 0 ? Math.round(gross / count / 100) * 100 : 0,
      approval_rate: attempts > 0 ? Math.round((succeededEvents / attempts) * 1000) / 1000 : null,
      failed_attempts: failedEvents,
      pending_count: Number(pending[0]?.pending ?? 0),
      by_method: byMethod.map((row) => ({
        type: row.type,
        count: Number(row.count),
        volume: Number(row.volume),
      })),
      daily: points,
    };
  }
}
