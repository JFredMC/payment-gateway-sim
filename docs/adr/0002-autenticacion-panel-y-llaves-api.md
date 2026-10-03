# 0002 · Dos tipos de credenciales: sesión del panel y llaves API

- **Estado:** Aceptado
- **Fecha:** 2026-10-02

## Contexto

La pasarela tiene dos tipos de clientes:

1. **Personas** que usan el panel del comercio desde el navegador.
2. **Servidores** del comercio que crean pagos y reembolsos, y el **checkout** que corre
   en el navegador del comprador.

Cada uno tiene necesidades de seguridad distintas.

## Decisión

- **Panel:** JWT de acceso de vida corta (15 min, guardado solo en memoria) y _refresh
  token_ opaco y rotativo en una cookie `HttpOnly; Secure; SameSite=Strict` con
  `Path=/api/v1/auth`. Si se reutiliza un refresh token, se revoca toda la familia. El
  JWT lleva el `merchant_id` (`mid`) y cada consulta del panel se limita a ese comercio.
- **API del comercio:** llaves estilo Stripe, solo en modo test:
  - `sk_test_…` (**secreta**): para la API de servidor a servidor. En la base de datos se
    guarda únicamente su SHA-256 y sus últimos 4 caracteres. El valor completo se
    muestra **una sola vez**, al rotarla.
  - `pk_test_…` (**publicable**): identifica al comercio en el checkout y solo permite
    tokenizar tarjetas. Es pública por diseño, así que se guarda en claro.
  - Las llaves tienen 32 caracteres base62 de un CSPRNG (≈190 bits). Con esa entropía
    basta un SHA-256 sin sal: no se pueden atacar por diccionario, y la búsqueda por
    hash es de tiempo constante respecto al secreto.
  - Un índice único parcial garantiza una sola llave activa por tipo y comercio. Rotar
    una llave revoca la anterior en la misma transacción.
- Las rutas de la API del comercio usan `@ApiKeyAuth('secret' | 'publishable')`: se
  excluyen del guard JWT global y pasan por `ApiKeyGuard`. Una ruta publicable acepta
  también la llave secreta, pero nunca al revés.
- El registro crea el comercio, su usuario dueño y el par de llaves en **una sola
  transacción**.

## Consecuencias

- Si se filtra la base de datos, las llaves secretas no se pueden usar.
- Para ver la llave secreta completa hay que rotarla, igual que en las pasarelas reales
  después de crearla.
- No hay modo _live_ ni roles de equipo. Quedan fuera del alcance del simulador.
