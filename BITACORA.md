# Bitácora del Portal de Trabajadores

Cada renglón es una versión publicada. La más reciente hasta arriba.

| Fecha | Versión | Qué cambió |
|---|---|---|
| 2026-09-04 | 0.1.11 | **Parentesco del contacto de emergencia**, obligatorio: se escoge de una lista (madre, padre, esposa, hijo, hermano…). Sale en la ficha en PDF, en el CSV y en el panel, junto al nombre. Quien ya estaba completo pasa a pendiente hasta que lo indique. |
| 2026-09-04 | 0.1.10 | **El panel de administración, para el celular.** La tabla de diez columnas deja de ser tabla en el teléfono: cada trabajador es una tarjeta con su nombre, su estado, sus documentos, el folio y la baja. La lista de lo que le falta se guarda detrás de un "Faltan 9" que se abre con un toque —también en computadora, donde ocupaba media columna—. Arriba, el buscador se sube al primer lugar y los botones de exportar se acomodan en un renglón. |
| 2026-09-04 | 0.1.9 | **El celular, arreglado.** La tarjeta de botones se comía un tercio de la pantalla y tapaba el campo de abajo: ahora es una barra delgada de dos botones y nada queda escondido detrás. La barra de arriba cabe en un renglón. Las casillas heredaban `width:100%` de los campos de texto —cada palomita medía lo ancho de su tarjeta y empujaba su texto fuera de la pantalla—, y eso descomponía el panel entero. La tabla del panel deja ver en el teléfono solo lo que sirve para escoger y revisar. Los botones de subir documento ya miden lo que mide un dedo. |
| 2026-09-03 | 0.1.8 | **La descarga cambia de forma.** El PDF vuelve a llevar nada más la fotografía —una hoja por trabajador, todos en un solo archivo— y los documentos escaneados se bajan aparte: un ZIP por trabajador, con su nombre, con los archivos tal como los subió. Todo viene dentro de un ZIP. Con esto ya no importa si el documento es PDF, PNG o foto: se entrega completo. |
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

## Cambios a la base de datos

`schema.sql` solo crea lo que no existe: una columna nueva sobre una tabla que
ya está no se puede agregar desde ahí. Para eso está `migrations/`, un archivo
por cambio; D1 lleva la cuenta de cuáles ya aplicó, así que el despliegue los
corre en cada publicación sin repetirlos. El workflow hace las dos cosas:
primero `schema.sql`, luego `d1 migrations apply`.

## Cómo se revisa el celular

La red de estas sesiones no alcanza el portal publicado, así que el acomodo en
pantalla chica se revisa levantando el portal en la máquina y fotografiándolo:
`scripts/vista-movil.mjs` lo abre en un Chromium del tamaño de un iPhone, guarda
las fotos y apunta lo que se sale de la pantalla o los botones a los que no se
les puede atinar. Las instrucciones están arriba del propio archivo. Así se
encontró lo de las casillas, que a simple vista parecía un problema de diseño.

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
