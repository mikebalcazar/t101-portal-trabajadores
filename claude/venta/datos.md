# roster101 — datos

| | |
|---|---|
| Versión | portal `0.10.0` · central `0.4.0` |
| Fecha | 2026-09-09 |
| Estado | En producción con el primer cliente (Taller 101). Falta prueba de escáner en teléfono real. |
| Portal del trabajador | https://t101-portal.mike-929.workers.dev |
| Panel de la empresa | https://t101-portal.mike-929.workers.dev/admin |
| Registro de empresa nueva | https://roster101-central.mike-929.workers.dev |
| Panel maestro | https://roster101-central.mike-929.workers.dev/roster |
| Repositorio | github.com/mikebalcazar/t101-portal-trabajadores (privado) |
| Stack | Cloudflare Workers (Hono) + D1 + R2 · HTML/JS sin framework · PDF a mano · correo por Resend · GitHub Actions |
| Aislamiento | Un Worker, una D1 y un bucket R2 por empresa cliente |
| Tipografía | Fira Sans (cifras) · Raleway (texto) · Sansation 700 (marca), autoalojadas |
| Color | `#0080C1` |
| Próximo | auth101 y expediente compartido vía `suite101-api` (fase 7 de la arquitectura v2) |

## Capturas
`capturas/` — 1600 px de ancho, tema claro, datos ficticios (`*@ejemplo.mx`).
01–02 acceso · 03–05 expediente del trabajador · 06–08 panel de la empresa · 09 celular (390 px ×3).

## Marca
`marca/` — `logo-azul` (azul sobre transparente), `logo-blanco` (blanco sobre transparente,
para fondo azul), `logo-azul-fondo` (versión completa con fondo), `icono` (aro con la r).
SVG + PNG.
