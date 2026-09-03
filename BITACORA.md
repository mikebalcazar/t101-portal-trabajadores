# Bitácora del Portal de Trabajadores

Cada renglón es una versión publicada. La más reciente hasta arriba.

| Fecha | Versión | Qué cambió |
|---|---|---|
| 2026-09-02 | 0.1.3 | **Primer despliegue automático desde GitHub Actions.** La identificación se pide en dos fotos: frente y reverso, cada una obligatoria y con su propio botón. Lo que ya se había subido como "INE" cuenta como el frente. |
| 2026-09-01 | 0.1.2 | Aviso de privacidad obligatorio, guardado por partes y cámara a pantalla completa. |
| 2026-09-01 | 0.1.0 | Primera publicación del portal. |

---

## Cómo se publica ahora

**Ya no hace falta ninguna computadora.** Cada cambio que llegue a la rama `main` del
repositorio publica solo: instala, aplica el esquema a la base, despliega el Worker,
actualiza los secretos y comprueba que el portal responda.

| | |
|---|---|
| Repositorio | https://github.com/mikebalcazar/t101-portal-trabajadores (privado) |
| Portal | https://t101-portal.mike-929.workers.dev |
| Administración | https://t101-portal.mike-929.workers.dev/admin |
| Clave de admin | `formon-caoba-formon-98` |
| Correos | Resend, desde `expedientes@envios.taller101.mx` |

Para subir cambios desde esta computadora: doble clic en `SUBIR-A-GITHUB.bat`.
Para publicar sin pasar por GitHub (respaldo): `PUBLICAR.bat`.

Los cuatro secretos viven en el repositorio, en Settings → Secrets and variables →
Actions: `CLOUDFLARE_API_TOKEN`, `CLAVE_ADMIN`, `RESEND_API_KEY` y `SECRETO`.
Los valores están también en `llaves.env`, que nunca se sube al repositorio.

**Ojo:** el `SECRETO` que quedó en GitHub es nuevo, distinto al que tenía el Worker
antes. Firma las sesiones, así que quien tuviera una sesión abierta tiene que volver
a entrar con su correo. Molesto una vez, nada más.

## Verificado en producción el 2026-09-02

- Corrida de GitHub Actions en verde, 56 segundos.
- El portal responde y trae las cuatro cosas: identificación en dos fotos, aviso de
  privacidad, guardado automático y cámara a pantalla completa.

## Pendientes

1. **Domicilio fiscal** para el aviso de privacidad. Ahorita dice "Ciudad de México,
   México" y eso no basta. Se cambia en `wrangler.toml`, variable `DOMICILIO`.
2. Que un abogado revise el aviso de privacidad.
3. Borrar en Resend la llave `t101-portal` (Full access), creada por error. La buena
   es `t101-portal-envio`.
4. Rotar el token de Cloudflare: se pegó en un chat.
5. Prueba con un trabajador de verdad antes de repartir la liga.
