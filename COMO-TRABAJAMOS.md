# Cómo trabajamos en este proyecto

Esta carpeta es la casa del **Portal de Trabajadores de Taller 101**.
Aquí vive el código y aquí viven tus llaves. No hace falta que la abras nunca,
pero si algún día quieres, todo está aquí.

## Las llaves

Desde el 19-sep-2026 este repositorio no guarda ninguna llave: no hay base ni
bucket propios, el correo lo manda la suite y la cookie del trabajador la firma
la suite. El único secreto está en GitHub (Settings → Secrets and variables →
Actions): `CLOUDFLARE_API_TOKEN`, para publicar. Se invalida desde el panel de
Cloudflare: se borra el token y se crea uno nuevo.

## Publicar una versión nueva

Cada cambio que llega a `main` publica solo: pruebas, staging, humo en staging,
producción (un Worker por empresa), medición. No hace falta ninguna computadora.

## Probar antes de publicar

```
npm run prueba
```

Y el portal entero, en staging: https://t101-portal-staging.mike-929.workers.dev
(empresa demo; el código de acceso sale en la respuesta, no por correo).

## Dónde viven los datos

En la base de la empresa dentro de la suite 101 (`suite101-api`, migración
0007, tablas `roster_*`; los documentos bajo `orgs/{empresa}/roster/` en el
bucket de la suite). El motor —rutas, validaciones, correos, fichas,
exportación, cuentas del panel— vive en `suite101-api/src/roster/`. Aquí queda
la pantalla y el cascarón que la conecta.

## Un cliente nuevo

Cada empresa tiene su propio Worker; sus datos viven en su base de la suite.
Para dar de alta una empresa: (1) en master101, alta de la empresa con roster101
prendida; (2) copiar `clientes/_plantilla.toml` a `clientes/<nombre-corto>.toml`
con su `ORG_ID` y sus datos, y mandarlo a `main`: el despliegue publica su Worker
junto con los demás. No hay base ni bucket que crear ni secretos que poner. El
dueño o la administración de la empresa abre `/admin.html` con su cuenta de la
suite y entra como dueño del panel.

La central de roster101 (registro de empresas y panel maestro) se retiró el
19-sep: tenía cero empresas y el alta ya vive en master101.

## Qué es cada carpeta

| Carpeta | Qué hay |
|---|---|
| `src/` | El cascarón: `/s101/*` y `/api/*` a la suite; `/api/salud` y `/api/config` aquí |
| `public/` | Lo que ve el trabajador y el panel de la empresa |
| `clientes/` | Un archivo por empresa; `_plantilla.toml` es el molde |
| `scripts/` | `humo.mjs` (staging), `medir-puerta.mjs` (producción, sólo mira), `clientes.mjs` |
| `pruebas/` | `0112` el cascarón con una suite de mentiras; `0101` la pantalla en un teléfono |
| `README.md` | Qué hace el portal, con detalle |

## Historial

Cada versión publicada queda registrada en `BITACORA.md`, con la fecha y qué cambió.
