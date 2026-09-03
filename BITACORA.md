# Bitácora del Portal de Trabajadores

Cada renglón es una versión publicada. La más reciente hasta arriba.

| Fecha | Versión | Qué cambió |
|---|---|---|
| 2026-09-03 | 0.1.7 | **Acta de nacimiento** entra a los documentos obligatorios: quien ya estaba completo pasa a pendiente hasta que la suba. Y la ficha en PDF ahora **pega los documentos escaneados** en hojas aparte, dos por hoja, detrás de la ficha de su dueño. Solo se pegan los que son JPEG (lo que se sube con la cámara); un PDF del SAT no se puede pegar sin desarmarlo, así que se apunta por nombre al final de las hojas. |
| 2026-09-03 | 0.1.6 | Cinco arreglos pedidos desde el celular: el letrero de "guardado" se quita solo a los 5 segundos; **la versión se ve siempre arriba a la derecha**; subir un archivo ya no avienta la pantalla hasta arriba; la ficha en PDF ya no lleva "entregados" ni "faltan"; y al descargar ficha **se palomea qué campos van** — casi nunca hace falta entregar todo. |
| 2026-09-03 | 0.1.5 | **Domicilio fiscal en el aviso de privacidad**: 5 de Mayo 60, San Nicolás Totolapan, La Magdalena Contreras, C.P. 10900, Ciudad de México. El aviso pasa a la versión `2026-09-03`. |
| 2026-09-03 | 0.1.4 | El teléfono del contacto de emergencia ya no puede ser el mismo celular del trabajador: ese contacto no serviría de nada. Se avisa mientras escribe y el servidor lo rechaza al guardar. |
| 2026-09-02 | 0.1.3 | **Primer despliegue automático desde GitHub Actions.** Además, en el mismo empujón: identificación en dos fotos (frente y reverso, cada una obligatoria); **fichas en PDF** de los trabajadores que se palomeen, con los datos bancarios aparte; **papelera de 30 días**, que aparta en vez de borrar y barre sola con el reloj de Cloudflare; **freno contra adivinar la clave de administración** (3 fallos y bloqueo de 15 min, 1 h, 4 h, 24 h, por dirección); **datos que no se repiten** entre expedientes (CURP, NSS, RFC, celular y correo); y la indicación de cada documento ya se lee completa en el celular, sin recortarse. |
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
| Clave de admin | En `llaves.env` y en el secreto `CLAVE_ADMIN` del repositorio. **No se escribe aquí:** este archivo se sube a GitHub. |
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

1. Que un abogado revise el aviso de privacidad. Ojo: quien ya lo aceptó tiene
   registrada la versión vieja (`2026-09-01`, la que iba sin domicilio) y el portal
   no se lo vuelve a pedir. Si el abogado quiere que todos acepten la versión con
   domicilio, hay que borrar los renglones de la tabla `consentimientos`.
2. Borrar en Resend la llave `t101-portal` (Full access), creada por error. La buena
   es `t101-portal-envio`.
3. Rotar el token de Cloudflare: se pegó en un chat.
4. **Cambiar la clave del panel.** Estuvo escrita en este archivo, dentro del
   repositorio; ya se quitó, pero sigue en el historial de GitHub. Se cambia en el
   secreto `CLAVE_ADMIN`, se dispara el workflow a mano y se actualiza `llaves.env`.
   Aprovechar para poner una larga.
5. Prueba con un trabajador de verdad antes de repartir la liga.
6. **Pegar también los documentos que son PDF** en la ficha. Hoy solo se pegan
   los JPEG; los PDF (los del SAT y el IMSS casi siempre lo son) se listan por
   nombre. Meterlos de verdad pide una librería que desarme PDF ajenos dentro
   del Worker, con lo que eso cuesta en peso y en tiempo de CPU. Falta decidirlo.
