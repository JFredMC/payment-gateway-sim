# 0001 · Monorepo pnpm: API NestJS + PostgreSQL y SPA Angular

- **Estado:** Aceptado
- **Fecha:** 2026-10-02

## Contexto

El proyecto simula una pasarela de pagos (estilo Stripe, solo modo test) con tres
superficies: una API para comercios, un checkout alojado para el comprador y un panel
para el comercio. Las tres comparten reglas de dominio (tarjetas de prueba, máquina de
estados del pago) y deben poder levantarse con un solo comando.

## Decisión

- **Monorepo pnpm** con `apps/api` (NestJS 11, TypeORM, PostgreSQL) y `apps/web`
  (Angular 22 standalone, signals, zoneless). El checkout y el panel viven en la misma
  SPA, con rutas separadas.
- **PostgreSQL** como única fuente de verdad: los pagos, los eventos y la cola de webhooks
  viven en tablas transaccionales (sin broker externo).
- Migraciones SQL escritas a mano (`synchronize: false`), errores RFC 9457 con un `code`
  estable, `X-Request-Id` en cada respuesta.
- **Docker Compose** levanta `postgres`, `api` y `web` (nginx con proxy `/api`).
- **CI** en GitHub Actions: formato, lint, typecheck, pruebas unitarias, build, e2e de la
  API contra PostgreSQL, prueba de humo con Compose y Playwright contra el stack real.

## Consecuencias

- Un solo `pnpm install` y un solo lockfile; los cambios que tocan API y web van en el
  mismo PR.
- Usar la base de datos como cola simplifica la operación, pero limita el throughput de
  webhooks. Es aceptable para un simulador.
