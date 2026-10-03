# 0006 · Webhooks: outbox transaccional, firma HMAC y reintentos

- **Estado:** Aceptado
- **Fecha:** 2026-10-03

## Contexto

El comercio necesita enterarse de lo que pasa con sus pagos (éxito, rechazo, reembolso)
sin consultar la API a cada rato. Para eso se envían notificaciones HTTP a sus servidores,
que pueden estar caídos, ser lentos o responder con error. Además, cualquiera podría
intentar enviarle al comercio un webhook falso.

## Decisión

- **Outbox transaccional:** cada evento se registra en la misma transacción que el
  cambio de estado ([ADR 0004](0004-payment-intents-tarjetas-e-idempotencia.md)).
  - Un _listener_ de `EventsService` inserta, en esa misma transacción, una fila en
    `webhook_deliveries` por cada endpoint habilitado y suscrito al tipo de evento.
  - No hay webhooks de cambios que hicieron _rollback_, ni cambios confirmados sin su
    webhook.
- **Worker en el mismo proceso** (`WebhookDispatcher`):
  - consulta la cola cada segundo y reclama lotes con `UPDATE … WHERE id IN (SELECT …
FOR UPDATE SKIP LOCKED)`, poniendo un _lease_ de 60 s en `next_attempt_at`;
  - si el proceso se cae a mitad de un envío, la entrega vuelve a la cola al vencer el
    lease;
  - varias réplicas de la API pueden correr el worker sin pisarse;
  - `WEBHOOK_WORKER_ENABLED=false` lo apaga, por ejemplo para correrlo aparte.
- **Firma** en el header `Pasarela-Signature: t=<unix>,v1=<hex>`:
  - `v1 = HMAC-SHA256(whsec_…, "<t>.<cuerpo crudo>")`;
  - el receptor compara en tiempo constante y rechaza timestamps con más de 5 min de
    diferencia (protección contra _replay_);
  - el secreto es por endpoint y se puede rotar.
- **Reintentos:**
  - solo un `2xx` confirma la entrega; cualquier otra respuesta, un _timeout_ (5 s) o
    un error de conexión se reintenta;
  - backoff exponencial `base × 5^(n−1)` con ±10 % de _jitter_: 10 s, 50 s, ~4 min,
    ~21 min, ~1,7 h;
  - tras 6 intentos la entrega queda `failed`. Desde el panel se puede reenviar
    manualmente (cada reenvío cuenta como un intento extra, marcado `manual`).
- **Registro de entregas:** estado, intentos, código y extracto de la respuesta
  (500 caracteres), duración, motivo del error y el _payload_ exacto.
- **Entrega "al menos una vez":** el mismo evento puede llegar más de una vez (por un
  reintento o un reenvío). El receptor debe deduplicar por `id` de evento, que también
  viaja en el header `Pasarela-Event-Id`.
- **Mitigación de SSRF:**
  - las URLs deben ser `https`;
  - antes de cada envío se resuelve el host y se rechazan direcciones loopback,
    privadas, link-local, CGNAT y multicast;
  - no se siguen redirecciones y la respuesta no se guarda completa;
  - máximo 5 endpoints por comercio;
  - `WEBHOOK_ALLOW_INSECURE_URLS=true` desactiva estas reglas, solo para desarrollo
    local (por ejemplo, un receptor en `localhost`).

## Consecuencias

- ✅ Sin infraestructura extra (ni Redis ni colas): PostgreSQL es la cola.
- ✅ Entregas consistentes con la base de datos y tolerantes a caídas del worker.
- ⚠️ La verificación de DNS antes del `fetch` deja una ventana de _DNS rebinding_. Una
  pasarela real enviaría desde una red de salida aislada, con un proxy de egreso.
- ⚠️ La cola por _polling_ suma hasta 1 s de latencia. Si hiciera falta bajarla,
  `LISTEN/NOTIFY` es el siguiente paso.
