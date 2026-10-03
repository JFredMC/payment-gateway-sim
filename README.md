# Pasarela de pagos simulada

Simulador de una pasarela de pagos estilo Stripe, **solo en modo test** (sin dinero
real ni redes de tarjetas): comercios con llaves API, _payment intents_ con máquina de
estados, checkout alojado con tarjetas de prueba, 3DS simulado, PSE y Nequi simulados,
reembolsos, `Idempotency-Key` y webhooks firmados con HMAC-SHA256.

Stack: **NestJS 11 · PostgreSQL · Angular 22 · pnpm · Docker Compose · GitHub Actions**.

> 🚧 En construcción. Este README se completa a medida que se integran los módulos.

## Inicio rápido

```bash
cp .env.example .env
docker compose up --build
# Web: http://localhost:4200 · API: http://localhost:3000/api/v1 · Swagger: http://localhost:3000/api/docs
```

Desarrollo local (Node 24 y pnpm 10):

```bash
pnpm install
docker compose up -d postgres
pnpm --filter api migration:run
pnpm dev
```

## Decisiones de arquitectura

Ver [docs/adr](docs/adr/README.md).

## Licencia

MIT
