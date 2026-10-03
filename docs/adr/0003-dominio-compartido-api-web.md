# 0003 · Dominio compartido entre la API y la web (copia verificada en CI)

- **Estado:** Aceptado
- **Fecha:** 2026-10-02

## Contexto

Varias reglas de negocio deben dar **exactamente** el mismo resultado en el servidor y en
el navegador:

- validación de tarjetas (Luhn, detección de marca, longitud del CVC, vencimiento);
- tarjetas de prueba y su resultado simulado;
- transiciones permitidas de la máquina de estados del _payment intent_;
- etiquetas en español de estados, métodos y eventos;
- bancos PSE ficticios y validación de celulares para Nequi.

El checkout valida en vivo mientras el comprador escribe, y la API vuelve a validar todo.
Además, el modo demo de GitHub Pages ejecuta un backend
simulado en el navegador que debe comportarse como la API real.

Un paquete compartido del workspace (`packages/domain`) es la opción "de libro", pero
obliga a configurar la compilación y la resolución de módulos en Nest (CommonJS),
Angular (esbuild), Jest y Vitest.

## Decisión

- El dominio vive en `apps/api/src/domain/`, en **TypeScript puro**: sin imports de Nest,
  Angular, TypeORM ni Node.
- `pnpm sync:domain` (`scripts/domain-sync.mjs --write`) lo copia byte a byte a
  `apps/web/src/app/domain/`.
- `pnpm check:domain` compara ambas carpetas y falla si difieren. Corre en CI antes del
  lint, así que una copia desactualizada nunca llega a `main`.
- Las pruebas del dominio solo usan `describe/it/expect`, por lo que corren igual en Jest
  (API) y en Vitest (web).

## Consecuencias

- ✅ Cero configuración extra de build; cada app compila el dominio como código propio.
- ✅ Una sola fuente de verdad, verificada por CI. Las pruebas corren en ambos runners.
- ⚠️ Hay archivos duplicados en el repo. Se mitiga con el chequeo de CI y con un
  `README.md` en la carpeta que indica que no se edite la copia de la web.
- 🔁 Si el dominio crece o aparece un tercer consumidor, migrar a un paquete del
  workspace es mecánico: la carpeta ya no tiene dependencias.
