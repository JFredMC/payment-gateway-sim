# 0007 · Panel del comercio: endpoints propios y KPIs calculados en SQL

- **Estado:** Aceptado
- **Fecha:** 2026-10-03

## Contexto

El panel web necesita listar pagos, ver su detalle (con línea de tiempo, reembolsos y
entregas de webhooks), crear pagos de prueba, reembolsar, cancelar y mostrar indicadores
en COP. La API pública (`/payment_intents`, `/refunds`) se autentica con llaves API
(`sk_test_…`), que nunca deben vivir en el navegador.

## Decisión

- El panel usa endpoints propios bajo `/dashboard/*`, autenticados con la sesión del
  panel (JWT de acceso + cookie de refresco, ver ADR 0002). Reutilizan los mismos
  servicios de dominio que la API pública, así que las reglas (máquina de estados, montos
  reembolsables, eventos y webhooks) son idénticas.
- Las operaciones que crean recursos desde el panel (crear pago, reembolsar) también
  exigen `Idempotency-Key`; la web genera la llave por intento y la reutiliza al
  reintentar el mismo formulario.
- `GET /dashboard/payment-intents/:id` devuelve en una sola respuesta el intent, sus
  reembolsos, la línea de tiempo (eventos en orden cronológico) y sus entregas de
  webhooks, para que la página de detalle no haga N peticiones.
- `GET /dashboard/summary?days=7|30` calcula los KPIs en PostgreSQL agrupando por día
  calendario de **America/Bogota**:
  - volumen bruto = suma de pagos exitosos en el periodo; reembolsado y neto aparte;
  - tasa de aprobación = `payment_intent.succeeded / (succeeded + payment_failed)` a
    partir de la tabla de eventos, de modo que cada intento rechazado cuenta aunque el
    pago termine aprobado;
  - ticket promedio, pagos pendientes, desglose por medio de pago y serie diaria con
    los días sin ventas rellenados en cero.

## Consecuencias

- Hay dos superficies de API con la misma lógica; los e2e cubren ambas.
- Los KPIs son consultas agregadas sobre las tablas transaccionales: suficiente para un
  simulador. Con volumen real se moverían a tablas de resumen o a un almacén analítico.
- Los días de Colombia (UTC-5, sin horario de verano) evitan que un pago de las 8 p. m.
  aparezca en el día siguiente.
