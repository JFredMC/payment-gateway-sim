import type { DemoCredential } from '../core/demo/demo-mode';
import { ALL_EVENTS } from '../domain/webhooks';
import {
  DAY_MS,
  type DemoDb,
  type DemoPaymentIntent,
  emptyDb,
  hashPassword,
  HOUR_MS,
  iso,
  MINUTE_MS,
  newId,
  randomBase62,
} from './demo-db';
import {
  authenticateIntent,
  cancelIntent,
  confirmIntent,
  createIntent,
  issueApiKey,
  type PaymentMethodInput,
  refundIntent,
  tokenize,
} from './demo-engine';
import { applyAttempt, receiverBehavior } from './demo-webhooks';

export const DEMO_PASSWORD = 'Demo1234';
export const DEMO_BUSINESS = 'Tienda Aurora';

/** The sample merchant's owner, shown on the login screen. */
export const DEMO_CREDENTIALS: readonly DemoCredential[] = [
  { fullName: 'Ana Gómez', email: 'ana@tienda-aurora.demo', password: DEMO_PASSWORD },
];

type Step =
  | { card: string; challenge?: 'approve' | 'reject' }
  | { pse: string; result?: 'approve' | 'reject' }
  | { nequi: string; result?: 'approve' | 'reject' };

interface SamplePayment {
  /** Hours before "now" when the intent was created. */
  hoursAgo: number;
  pesos: number;
  description: string;
  email?: string;
  steps?: Step[];
  refunds?: { hoursAgo: number; pesos?: number; reason?: string }[];
  cancel?: { hoursAgo: number; reason: string };
}

/** A month of activity of a small online store: approvals, declines, 3DS, PSE, Nequi, refunds. */
const PAYMENTS: SamplePayment[] = [
  {
    hoursAgo: 29 * 24 + 5,
    pesos: 89_900,
    description: 'Audífonos inalámbricos',
    steps: [{ card: '4242424242424242' }],
  },
  {
    hoursAgo: 27 * 24 + 2,
    pesos: 45_000,
    description: 'Camiseta estampada',
    steps: [{ card: '5555555555554444' }],
  },
  {
    hoursAgo: 26 * 24 + 7,
    pesos: 120_000,
    description: 'Zapatos deportivos',
    email: 'carlos.r@example.com',
    steps: [{ pse: '1001', result: 'approve' }],
  },
  {
    hoursAgo: 24 * 24 + 1,
    pesos: 32_500,
    description: 'Taza de cerámica',
    steps: [{ nequi: '3001234567', result: 'approve' }],
  },
  {
    hoursAgo: 22 * 24 + 3,
    pesos: 250_000,
    description: 'Chaqueta impermeable',
    steps: [{ card: '4000000000009995' }, { card: '4242424242424242' }],
  },
  {
    hoursAgo: 20 * 24 + 6,
    pesos: 18_900,
    description: 'Llavero artesanal',
    steps: [{ card: '4000000000000002' }],
    cancel: { hoursAgo: 19 * 24, reason: 'abandoned' },
  },
  {
    hoursAgo: 18 * 24 + 4,
    pesos: 159_900,
    description: 'Morral de cuero',
    email: 'laura.m@example.com',
    steps: [{ card: '378282246310005' }],
    refunds: [{ hoursAgo: 17 * 24 + 2, reason: 'requested_by_customer' }],
  },
  {
    hoursAgo: 16 * 24 + 8,
    pesos: 64_000,
    description: 'Kit de café de origen',
    steps: [{ card: '4000002760003184', challenge: 'approve' }],
  },
  {
    hoursAgo: 15 * 24 + 2,
    pesos: 99_000,
    description: 'Gafas de sol',
    steps: [
      { card: '4000002760003184', challenge: 'reject' },
      { nequi: '3109876543', result: 'approve' },
    ],
  },
  {
    hoursAgo: 13 * 24 + 5,
    pesos: 210_000,
    description: 'Reloj análogo',
    steps: [{ pse: '1002', result: 'reject' }, { card: '4242424242424242' }],
  },
  {
    hoursAgo: 12 * 24 + 1,
    pesos: 75_500,
    description: 'Libro de cocina colombiana',
    steps: [{ card: '4000056655665556' }],
    refunds: [{ hoursAgo: 10 * 24 + 3, pesos: 20_000, reason: 'requested_by_customer' }],
  },
  {
    hoursAgo: 10 * 24 + 6,
    pesos: 38_000,
    description: 'Vela aromática',
    steps: [{ nequi: '3204567890', result: 'approve' }],
  },
  {
    hoursAgo: 9 * 24 + 2,
    pesos: 145_000,
    description: 'Audífonos de estudio',
    steps: [
      { card: '4000000000000069' },
      { card: '4000000000000069' },
      { card: '4000000000000069' },
    ],
  },
  {
    hoursAgo: 7 * 24 + 4,
    pesos: 52_000,
    description: 'Bolso tejido wayuu',
    steps: [{ card: '4242424242424242' }],
  },
  {
    hoursAgo: 6 * 24 + 3,
    pesos: 28_000,
    description: 'Cuaderno ecológico',
    steps: [{ pse: '1003', result: 'approve' }],
  },
  {
    hoursAgo: 5 * 24 + 6,
    pesos: 310_000,
    description: 'Silla ergonómica',
    email: 'andres.p@example.com',
    steps: [{ card: '4242424242424242' }],
    refunds: [{ hoursAgo: 3 * 24 + 20, pesos: 60_000, reason: 'requested_by_customer' }],
  },
  {
    hoursAgo: 4 * 24 + 2,
    pesos: 67_900,
    description: 'Termo de acero',
    steps: [{ card: '5555555555554444' }],
  },
  {
    hoursAgo: 3 * 24 + 5,
    pesos: 41_500,
    description: 'Gorra bordada',
    steps: [{ nequi: '3157654321', result: 'approve' }],
  },
  {
    hoursAgo: 2 * 24 + 3,
    pesos: 189_000,
    description: 'Parlante bluetooth',
    steps: [{ card: '4242424242424242' }],
  },
  {
    hoursAgo: 30,
    pesos: 23_900,
    description: 'Medias de algodón',
    steps: [{ card: '4000000000000127' }],
  },
  {
    hoursAgo: 26,
    pesos: 99_900,
    description: 'Lámpara de escritorio',
    steps: [{ card: '4000002760003184' }],
  },
  {
    hoursAgo: 5,
    pesos: 56_000,
    description: 'Pedido #1043',
    steps: [{ card: '4242424242424242' }],
  },
  { hoursAgo: 2, pesos: 135_000, description: 'Pedido #1044', email: 'sofia.v@example.com' },
];

interface Action {
  at: number;
  run: (at: number) => void;
}

/** Builds the sample database relative to `now` (so the charts always show recent days). */
export async function createSeedDb(now: number): Promise<DemoDb> {
  const db = emptyDb();
  const start = now - 31 * DAY_MS;
  const [credential] = DEMO_CREDENTIALS;
  const salt = newId('salt');
  const merchantId = newId('acct');
  db.merchants.push({ id: merchantId, businessName: DEMO_BUSINESS, createdAt: iso(start) });
  db.users.push({
    id: crypto.randomUUID(),
    email: credential.email,
    fullName: credential.fullName,
    role: 'OWNER',
    merchantId,
    salt,
    passwordHash: await hashPassword(credential.password, salt),
    createdAt: iso(start),
  });
  issueApiKey(db, merchantId, 'publishable', start);
  const secret = issueApiKey(db, merchantId, 'secret', start).key;
  secret.lastUsedAt = iso(now - 2 * HOUR_MS);

  const actions: Action[] = [
    {
      at: now - 20 * DAY_MS,
      run: (at) =>
        db.endpoints.push({
          id: newId('we'),
          merchantId,
          url: 'https://erp.tienda-aurora.example/falla/webhooks',
          description: 'ERP (simula un receptor caído: responde 500)',
          enabledEvents: ['refund.created'],
          status: 'enabled',
          secret: `whsec_${randomBase62(32)}`,
          createdAt: iso(at),
          updatedAt: iso(at),
        }),
    },
    {
      at: now - 4 * DAY_MS,
      run: (at) =>
        db.endpoints.push({
          id: newId('we'),
          merchantId,
          url: 'https://tienda-aurora.example/webhooks/pasarela',
          description: 'Servidor de la tienda',
          enabledEvents: [ALL_EVENTS],
          status: 'enabled',
          secret: `whsec_${randomBase62(32)}`,
          createdAt: iso(at),
          updatedAt: iso(at),
        }),
    },
  ];

  for (const sample of PAYMENTS) {
    const created = now - sample.hoursAgo * HOUR_MS;
    let pi: DemoPaymentIntent | null = null;
    actions.push({
      at: created,
      run: (at) => {
        pi = createIntent(
          db,
          merchantId,
          {
            amount: sample.pesos * 100,
            description: sample.description,
            customerEmail: sample.email,
          },
          at,
        );
      },
    });
    (sample.steps ?? []).forEach((step, index) => {
      actions.push({
        at: created + (index + 1) * 3 * MINUTE_MS,
        run: (at) => runStep(db, merchantId, pi!, step, at),
      });
    });
    for (const refund of sample.refunds ?? []) {
      actions.push({
        at: now - refund.hoursAgo * HOUR_MS,
        run: (at) =>
          refundIntent(
            db,
            pi!,
            { amount: refund.pesos && refund.pesos * 100, reason: refund.reason },
            at,
          ),
      });
    }
    if (sample.cancel) {
      const { reason } = sample.cancel;
      actions.push({
        at: now - sample.cancel.hoursAgo * HOUR_MS,
        run: (at) => cancelIntent(db, pi!, reason, at),
      });
    }
  }

  actions.sort((a, b) => a.at - b.at);
  for (const action of actions) {
    settleSeedDeliveries(db, action.at);
    action.run(action.at);
  }
  settleSeedDeliveries(db, now);
  db.session = null;
  return db;
}

function runStep(db: DemoDb, merchantId: string, pi: DemoPaymentIntent, step: Step, at: number) {
  let input: PaymentMethodInput;
  let result: 'approve' | 'reject' | undefined;
  if ('card' in step) {
    input = {
      type: 'card',
      card: {
        number: step.card,
        exp_month: 12,
        exp_year: 2034,
        cvc: step.card.length === 15 ? '1234' : '123',
      },
      billing: { name: 'Cliente de prueba' },
    };
    result = step.challenge;
  } else if ('pse' in step) {
    input = { type: 'pse', pse: { bank: step.pse, person_type: 'natural' } };
    result = step.result;
  } else {
    input = { type: 'nequi', nequi: { phone: step.nequi } };
    result = step.result;
  }
  const pm = tokenize(db, merchantId, input, at);
  confirmIntent(db, pi, pm.id, at);
  if (result && pi.status === 'requires_action') {
    authenticateIntent(db, pi, result, at + 45_000);
  }
}

/**
 * Seed-time worker: answers due deliveries at their scheduled time with the
 * simulated receiver's outcome (no need to sign historical attempts).
 */
function settleSeedDeliveries(db: DemoDb, until: number) {
  for (;;) {
    const due = db.deliveries
      .filter(
        (d) => d.status === 'pending' && d.nextAttemptAt && Date.parse(d.nextAttemptAt) <= until,
      )
      .sort((a, b) => Date.parse(a.nextAttemptAt!) - Date.parse(b.nextAttemptAt!));
    if (due.length === 0) return;
    for (const delivery of due) {
      const at = Date.parse(delivery.nextAttemptAt!) + 800;
      const endpoint = db.endpoints.find((e) => e.id === delivery.endpointId);
      const ok = endpoint && receiverBehavior(endpoint.url) === 'ok';
      applyAttempt(
        delivery,
        ok
          ? {
              responseStatus: 200,
              responseBody: '{"recibido":true,"firma_valida":true}',
              errorCode: null,
              durationMs: 60 + Math.round(Math.random() * 80),
              terminal: false,
            }
          : {
              responseStatus: 500,
              responseBody: '{"error":"Error interno del receptor (simulado)"}',
              errorCode: 'http_status',
              durationMs: 90 + Math.round(Math.random() * 60),
              terminal: false,
            },
        false,
        at,
      );
    }
  }
}
