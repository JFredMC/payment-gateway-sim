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
