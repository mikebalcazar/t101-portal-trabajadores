# Bitácora de roster101

Cada renglón es una versión publicada. La más reciente hasta arriba.

| Fecha | Versión | Qué cambió |
|---|---|---|
| 2026-09-07 | 0.6.1 | **Vista compacta: la lista para pasar lista.** Un interruptor arriba cambia entre *Completa* —la de siempre, para revisar a alguien— y *Compacta*, que deja nada más el nombre, empezando por apellidos, y el RFC pegado a un lado. El renglón pasa de 63 a 46 píxeles y en el teléfono la tarjeta de 165 a 92, así que cabe casi el doble de gente en la pantalla. Sigue sirviendo para lo mismo: se palomea para las fichas, el nombre abre el expediente y el buscador encuentra por RFC. Se acuerda de cuál se dejó puesta. De paso: un error al abrir el panel ya no se traga en silencio —un panel en blanco se veía igual que uno que no ha entrado—. |
| 2026-09-07 | 0.6.0 | **El expediente de cada quien se abre desde el panel, y ya se ve qué le falta de escribir.** Antes el "Faltan 9" contaba nada más los papeles: alguien podía tener su carátula bancaria subida y ni un dato de su cuenta capturado, y el panel no lo decía. Ahora cuenta las dos cosas y las separa: *por escribir* y *por entregar*. Tocando el nombre de la persona —o con doble clic en su renglón— se abre su formato tal como ella lo ve, con lo que escribió, lo que le falta marcado en rojo, y sus documentos. Desde ahí se puede capturar por ella lo que haga falta, y queda apuntado en la bitácora con el nombre de a quién se le tocó el expediente. **Los documentos se ven, no se tocan:** subirlos y borrarlos sigue siendo cosa suya, y el servidor no tiene ninguna ruta que permita otra cosa. El aviso de privacidad tampoco se puede aceptar por nadie. |
| 2026-09-07 | 0.5.1 | **La bitácora se ve completa y se filtra con palomitas.** Ahora sale todo en un solo hilo —quién pidió su código, quién usó su acceso, quién lo escribió mal, quién guardó y quién subió qué— y son 18 casillas las que deciden qué se ve, agrupadas en accesos, expedientes y administración. De entrada viene prendida nada más una, la que casi siempre se consulta: quién pidió su código. Hay atajos de *nada · todo · solo quién pidió su código*, y lo palomeado se recuerda para la próxima vez. Los detalles se leen completos: el documento dice "Constancia NSS" y no `nss`. |
| 2026-09-07 | 0.5.0 | **Se puede ver quién ha pedido entrar.** El portal apuntaba cada movimiento desde el primer día, pero nadie podía leerlo. En administración hay una tarjeta nueva con la lista: cada correo que pidió su código, con la fecha y la hora en que se le mandó, y si entró, si escribió mal el código o si el correo no salió. Se filtra por correo y por periodo, se puede ver también lo de expedientes y lo de administración, y se baja en CSV. Además se apunta lo que antes no dejaba rastro: quien pidió código y no le llegó, quien lo pidió dos veces muy seguido y quien falló al escribirlo. |
| 2026-09-07 | 0.4.0 | **La cámara ya no toma fotos: escanea.** La credencial se recorta exactamente al recuadro que se ve en la pantalla —el marco tiene la proporción real de una INE (85.6 × 54 mm), así que lo que se guarda es la credencial y nada de la mesa—. Los papeles (acta, CURP, NSS, comprobante, constancia) se capturan en marco de hoja carta: se marcan las cuatro esquinas, se endereza la perspectiva y se le quita la sombra, de modo que el papel queda blanco parejo y la tinta negra, como un escáner de verdad. Ese resultado se guarda **en PDF**, no en foto. Lo mismo quedó del lado de roster101 central, para los documentos que sube la empresa nueva. |
| 2026-09-07 | — | **Registro de la empresa nueva, que se llena sola.** A la empresa se le manda una liga; su representante entra con un código de 6 dígitos a su correo, captura sus datos y sube sus papeles a su propio ritmo. Cuando termina, a roster101 le llega el aviso, se revisa y de ahí mismo se le abre su portal con los datos que ella capturó: nadie los vuelve a teclear. |
| 2026-09-07 | — | **Un Worker por cliente.** Cada empresa que entra tiene su propio Worker, su propia base y su propio bucket: los expedientes de una nunca viven junto a los de otra. El alta se corre desde GitHub Actions —crea todo, despliega y manda el correo de bienvenida con la liga y la clave— y el despliegue automático recorre a todos los clientes dados de alta. |
| 2026-09-07 | 0.3.0 | **El nombre del cliente sale de su configuración, no del código.** Estaba escrito a mano en 21 lugares —correos, nombres de archivo, textos del ZIP, mensajes de error, pies de página y hasta la marca del documento bancario que firma el trabajador—. Ahora todo eso lee `EMPRESA` / `RAZON_SOCIAL`. Probado cambiando la configuración a otra empresa: correos, archivos y documentos salen con el nombre nuevo. |
| 2026-09-07 | 0.2.1 | El nombre se escribe **roster101**, todo en minúsculas, en todos lados. |
| 2026-09-07 | 0.2.0 | **La plataforma se llama roster101.** El logotipo es el de Taller 101 con la palabra cambiada: misma tipografía (Sansation Bold), mismo tamaño e interletrado, convertida a trazos; el anillo, el "101" y la raya son los vectores del archivo de marca. Como "roster" es más ancha que "taller", el conjunto se volvió a centrar y la raya se alargó lo mismo que creció la palabra. Taller 101 sigue siendo la empresa: es la que aparece en el aviso de privacidad, en los correos, en las fichas y en los expedientes. |
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

## Un cliente nuevo

Cada empresa tiene **su propio Worker, su propia base D1 y su propio bucket R2**.
Los datos de una no se cruzan con los de otra ni por una consulta mal escrita:
sencillamente no están en la misma base.

Para dar de alta una empresa: **Actions → Alta de cliente → Run workflow**. Pide
el nombre corto, el nombre de la empresa, su razón social, su domicilio y tres
correos. Viene en **simulacro** por default: la primera corrida nada más dice
qué haría. Apagando el simulacro, crea la base, el bucket y el Worker, aplica el
esquema, publica, le pone sus secretos, comprueba que responda, **le manda por
correo sus ligas y la clave de su panel**, y deja el archivo del cliente en
`clientes/` para que de ahí en adelante se publique junto con los demás.

La clave del panel y la firma de sesiones de cada empresa se generan en su alta,
se guardan solo en su Worker y se le mandan por correo: no quedan en el
repositorio ni en la bitácora. La llave de Resend sí es la misma para todos —es
de roster101— y se refresca en cada publicación.

El de Taller 101 es el `wrangler.toml` de la raíz, que además es el que se usa
para trabajar en local.

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
6. **El formulario de datos del cliente.** Hoy el correo de alta le pide a la
   empresa que responda con su razón social, su CSF, su domicilio y su aviso de
   privacidad. Falta la pantalla donde los suba ella misma y que eso actualice
   su configuración sin pasar por GitHub.
7. **Panel de roster101.** Dar de alta desde una pantalla en vez de disparar el
   flujo de Actions, y ver ahí todas las empresas, su uso y su estado.
