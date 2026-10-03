# Registros de decisiones de arquitectura (ADR)

Registros cortos de las decisiones que dan forma al código, en formato
_Contexto → Decisión → Consecuencias_. Los ADR se numeran de forma secuencial y no se
reescriben: si una decisión cambia, un ADR nuevo enlaza al que reemplaza.

| #                                                       | Título                                                            | Estado   |
| ------------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| [0001](0001-monorepo-y-stack.md)                        | Monorepo pnpm: API NestJS + PostgreSQL y SPA Angular              | Aceptado |
| [0002](0002-autenticacion-panel-y-llaves-api.md)        | Dos tipos de credenciales: sesión del panel y llaves API          | Aceptado |
| [0003](0003-dominio-compartido-api-web.md)              | Dominio compartido entre la API y la web (copia verificada en CI) | Aceptado |
| [0004](0004-payment-intents-tarjetas-e-idempotencia.md) | Payment intents: máquina de estados, tokenización e idempotencia  | Aceptado |
| [0005](0005-checkout-alojado.md)                        | Checkout alojado: enlace con client secret y desafíos simulados   | Aceptado |
| [0006](0006-webhooks-firmados.md)                       | Webhooks: outbox transaccional, firma HMAC y reintentos           | Aceptado |
