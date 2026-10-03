# 0005 · Checkout alojado: enlace con client secret y desafíos simulados

- **Estado:** Aceptado
- **Fecha:** 2026-10-03

## Contexto

El comprador no tiene cuenta en la pasarela ni en el panel del comercio, y aun así debe
poder:

- ver el pago;
- tokenizar su tarjeta;
- confirmar;
- resolver un desafío (3DS, portal PSE, notificación de Nequi).

Además, recargar la página o abrir el enlace en otro dispositivo no debe romper el flujo.

## Decisión

- **Enlace de pago:** `/checkout/:id?secret=<client_secret>`. El `client_secret` es una
  capacidad para **un solo** pago. La API lo compara en tiempo constante y no sirve para
  nada más: no permite reembolsar, listar ni ver otros pagos.
- **Tokenización en el navegador:** el checkout envía los datos de la tarjeta solo a
  `POST /payment_methods` con la llave publicable del comercio (que viene en la vista
  del checkout) y confirma con el `pm_…` resultante.
  - El interceptor del panel nunca adjunta el JWT a las rutas `/checkout/` ni a las
    peticiones que ya llevan su propia credencial.
- **Validación en vivo con el dominio compartido** ([ADR 0003](0003-dominio-compartido-api-web.md)):
  formato por marca, Luhn, vencimiento y CVC (4 dígitos para Amex). La API vuelve a
  validar todo.
- **Idempotencia por intento:** cada `pm_…` tiene su `Idempotency-Key`. Si la confirmación
  falla por la red, el reintento reutiliza el mismo token y la misma clave, de modo que
  un pago nunca se confirma dos veces.
- **Estado en la API, no en la página:** la vista se deriva del `status` y del
  `next_action` del intent. Los desafíos simulados se muestran en la misma página y el
  comprador elige aprobar o rechazar. Una recarga muestra exactamente el mismo paso.
- **Mensajes al comprador en español** desde `DECLINES[decline_code].messageEs`, junto
  con los intentos restantes.

## Consecuencias

- ✅ Sin sesión ni cookies para el comprador; enlaces compartibles y recargables.
- ✅ El PAN solo viaja una vez, a la tokenización.
- ⚠️ Quien tenga el enlace puede pagar ese intent (igual que en una pasarela real). No
  puede hacer nada más.
