# api — Pasarela de pagos simulada

NestJS 11 + TypeORM + PostgreSQL. Global prefix: `/api/v1`. Swagger UI at `/api/docs`.

## Scripts (run from the repo root with `pnpm --filter api <script>`)

| Script                                                 | Description                                  |
| ------------------------------------------------------ | -------------------------------------------- |
| `dev`                                                  | Start in watch mode                          |
| `build` / `start:prod`                                 | Compile to `dist/` / run the compiled app    |
| `lint` / `typecheck`                                   | ESLint / `tsc --noEmit`                      |
| `test` / `test:cov`                                    | Unit tests (Jest)                            |
| `test:e2e`                                             | E2E tests: needs PostgreSQL (`DATABASE_URL`) |
| `migration:run` / `migration:revert`                   | Apply / revert TypeORM migrations            |
| `migration:generate -- src/database/migrations/<Name>` | Generate a migration from entity changes     |

## Contents

- `src/config/env.schema.ts`: environment validated with zod. The app refuses to start with an invalid env.
- `src/database/`: TypeORM `DataSource` (CLI) + `DatabaseModule`, hand-written SQL migrations, `synchronize: false`.
- `src/common/`: RFC 9457 `ProblemDetailsFilter` + `DomainError` codes, `X-Request-Id` middleware, money and cursor helpers.
- `src/modules/health/`: `GET /api/v1/health` (Terminus, database ping).
- `src/common/ids/`: Stripe-style public ids (`acct_`, `pi_`, `re_`, …) from a CSPRNG.
- `src/modules/users/` + `src/modules/auth/`: dashboard sign-up/login/refresh/logout/me, argon2id passwords, JWT access tokens (with the merchant id) and rotating refresh tokens with reuse detection.
- `src/modules/merchants/`: merchants (created at sign-up) and `GET /account` (secret key).
- `src/modules/api-keys/`: `pk_test_`/`sk_test_` keys (SHA-256 at rest, secret shown once on roll), `ApiKeyGuard` + `@ApiKeyAuth()` for merchant-API routes, `GET /dashboard/api-keys`, `POST /dashboard/api-keys/roll` ([ADR 0002](../../docs/adr/0002-autenticacion-panel-y-llaves-api.md)).
- `src/domain/`: pure-TypeScript domain shared with the web app (cards/Luhn/brands, test cards, PSE/Nequi, state machine, events). Copied to `apps/web/src/app/domain/` with `pnpm sync:domain`; CI runs `pnpm check:domain` ([ADR 0003](../../docs/adr/0003-dominio-compartido-api-web.md)).
- `src/modules/idempotency/`: `Idempotency-Key` storage scoped by merchant (replay with `Idempotent-Replayed: true`, `422` on reuse with a different body).
- `src/modules/events/`: append-only `evt_` log written in the same transaction as each state change, plus a subscriber hook used by webhooks.
- `src/modules/payments/`: payment methods (tokenization; the PAN is never stored), payment intents (`/payment_intents`, confirm, cancel), refunds (`/refunds`) and the public hosted-checkout endpoints (`/checkout/:id`, authorized by `client_secret`) ([ADR 0004](../../docs/adr/0004-payment-intents-tarjetas-e-idempotencia.md)).
