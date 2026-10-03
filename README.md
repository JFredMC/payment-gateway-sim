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

## Autenticación

| Cliente               | Credencial                                                    |
| --------------------- | ------------------------------------------------------------- |
| Panel del comercio    | JWT de acceso (en memoria) + refresh token rotativo en cookie |
| Servidor del comercio | `Authorization: Bearer sk_test_…` (llave secreta)             |
| Checkout (navegador)  | `Authorization: Bearer pk_test_…` (llave publicable)          |

Al registrarse, el comercio recibe un par de llaves de prueba. La llave secreta se guarda
como hash SHA-256 y solo se muestra completa al rotarla
([ADR 0002](docs/adr/0002-autenticacion-panel-y-llaves-api.md)).

```bash
curl http://localhost:3000/api/v1/account -H "Authorization: Bearer sk_test_…"
```

## Decisiones de arquitectura

Ver [docs/adr](docs/adr/README.md).

## Licencia

MIT
