# 0004 · Payment intents: máquina de estados, tokenización e idempotencia

- **Estado:** Aceptado
- **Fecha:** 2026-10-02

## Contexto

Un pago no es una sola llamada: el comprador puede equivocarse de tarjeta, el banco puede
pedir autenticación (3DS, PSE, Nequi), la red puede cortar la respuesta y el comercio
puede reintentar. Necesitamos un modelo que soporte todo eso sin cobrar dos veces y sin
manejar datos de tarjeta que no deberíamos tener.

## Decisión

### Máquina de estados

El estado de un `payment_intent` solo cambia en un punto (`PaymentIntentsService.move`),
que valida la transición contra la tabla del dominio (`payment-intent-state.ts`) y
registra un evento en la misma transacción:

```
requires_payment_method → processing → succeeded
                                     ↘ requires_action → processing → …
                                     ↘ requires_payment_method (rechazo, reintento)
                                     ↘ failed (3 intentos fallidos)
requires_payment_method | requires_action → canceled
```

- Los estados terminales son `succeeded`, `failed` y `canceled`.
- Las operaciones concurrentes sobre un mismo intent se serializan con
  `SELECT … FOR UPDATE`.
- Los reembolsos (totales o parciales) no cambian el estado del intent. Se acumulan en
  `amount_refunded` (con un `CHECK` en la base de datos) y se exponen como
  `refund_status: none | partial | full`.

### Un rechazo no es un error HTTP

Como en Stripe, un rechazo del emisor es un **resultado de negocio**:

- `confirm` responde `200` con el intent en `requires_payment_method` y un
  `last_payment_error` (`decline_code`, mensaje).
- Los `4xx` quedan reservados para errores del cliente: tarjeta inválida, estado
  inesperado, llave incorrecta, etc.

Así, el checkout puede mostrar el motivo y permitir reintentar con otro medio de pago.

### Tokenización: el PAN nunca se guarda

- `POST /payment_methods` (llave publicable) recibe el número, valida Luhn, marca,
  vencimiento y CVC, y guarda solo `brand`, `last4`, `exp_month/exp_year`, `funding` y
  el **resultado simulado** de la tarjeta de prueba (privado, nunca serializado).
- El número completo y el CVC no se persisten ni se registran en logs.
- El intent se confirma con el id `pm_…`, no con datos de tarjeta.

En una pasarela real esto equivale a reducir el alcance PCI DSS: el PAN quedaría en una
bóveda separada. Aquí, al ser simulación, ni siquiera existe esa bóveda.

### Idempotencia

- Crear intents y reembolsos, y confirmar (API del comercio y checkout), exige el header
  `Idempotency-Key`.
- La clave se guarda por comercio, con un hash del cuerpo y la respuesta, durante
  `IDEMPOTENCY_KEY_TTL_HOURS` (24 h por defecto):
  - repetir la petición devuelve la misma respuesta con `Idempotent-Replayed: true`;
  - reutilizar la clave con otro cuerpo responde `422 IDEMPOTENCY_KEY_REUSED`.

### Montos

- Montos enteros en unidades menores de COP (2 decimales; `5000000` = $ 50.000).
- Límites: $ 1.000 a $ 20.000.000.
- Solo existe `livemode: false`.

## Consecuencias

- ✅ Las transiciones ilegales son imposibles por construcción, y cada cambio deja un
  evento: es la base para la línea de tiempo del panel y para los webhooks.
- ✅ Reintentos seguros ante cortes de red, tanto del comercio como del comprador.
- ⚠️ La simulación decide el resultado al tokenizar. Es suficiente para un simulador,
  pero no modela errores transitorios de red con el emisor.
