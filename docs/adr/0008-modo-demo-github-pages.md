# 0008 · Modo demo en GitHub Pages con backend simulado en el navegador

- **Estado:** Aceptado
- **Fecha:** 2026-10-03

## Contexto

El proyecto necesita una demo pública que cualquiera pueda abrir sin instalar nada. Un
despliegue real de la API (NestJS + PostgreSQL + worker de webhooks) tiene costo y
operación; GitHub Pages solo sirve archivos estáticos.

## Decisión

- La SPA se compila con la configuración `demo` (`ng build -c demo`), que reemplaza
  `environment.ts` por `environment.demo.ts`. Este agrega un interceptor HTTP final que
  responde todas las peticiones a `/api/v1` con `DemoBackend`, en el mismo navegador.
- `DemoBackend` replica el contrato de la API (rutas, JSON, estados HTTP, problem+json,
  `Idempotency-Key`, paginación) y usa el **dominio compartido** (`apps/web/src/app/domain`,
  copia verificada en CI de `apps/api/src/domain`), así que la máquina de estados, la
  validación de tarjetas, las tarjetas de prueba y el backoff de webhooks son los mismos.
- Los datos viven en `localStorage`. Cada petición trabaja sobre una copia y solo se
  guarda si termina bien (como una transacción). Un comercio de ejemplo con un mes de
  actividad se genera relativo a la fecha actual; «Restablecer demo» lo vuelve a crear.
- Webhooks: no se puede hacer POST a servidores arbitrarios desde una página estática,
  así que el receptor se simula. La firma sí es real (HMAC-SHA256 con Web Crypto sobre
  `t.cuerpo`) y el receptor simulado la verifica; los reintentos con backoff se procesan
  en cada petición mientras se usa la app.
- La interfaz muestra «Modo demo · datos simulados» en el panel, el login, el registro y
  el checkout, y las credenciales del comercio de ejemplo en el login.
- `pages.yml` publica el build en cada push a `main`; `404.html` (copia de `index.html`)
  permite recargar rutas profundas.

## Consecuencias

- La demo no ejercita PostgreSQL, el worker real ni la red; eso lo cubren los e2e de la
  API, el smoke test de Docker Compose y los e2e de Playwright contra el stack completo.
- Hay dos implementaciones del contrato HTTP. `demo-backend.spec.ts` y un job de CI con
  Playwright contra el build de Pages las mantienen alineadas con la interfaz.
- El build normal (`ng build`) no incluye el backend simulado.
