# roster101 — para seguir en otro chat

Léelo completo antes de tocar nada. Aquí está lo que otro chat tardó un día
entero en aprender. Después de esto, la fuente de verdad es el propio
repositorio: `BITACORA.md` dice qué se hizo y cuándo, y el código dice cómo.

## Qué es esto

**roster101** es una plataforma que se renta a empresas para que sus
trabajadores armen su expediente desde el celular: datos, documentos
escaneados, aviso de privacidad. **taller101** es dos cosas: quien la hizo (Mike,
`mike@forespot.com`) y la primera empresa que la usa.

Cada empresa cliente tiene **su propio Worker de Cloudflare, su propia base D1 y
su propio bucket R2**. Los datos de una nunca viven junto a los de otra.

Tres capas, siempre con estos nombres:

| | Se llama | Quién entra | Dónde vive |
|---|---|---|---|
| 1 | **Portal del trabajador** | el trabajador | `/` del Worker de su empresa |
| 2 | **Panel de la empresa** | quien lleva administración ahí | `/admin` del mismo Worker |
| 3 | **Panel maestro** | nosotros | `/roster` en central |
| — | **Registro de empresa** | el representante de una empresa nueva | `/` en central |

## Dónde está todo

| | |
|---|---|
| Repositorio | https://github.com/mikebalcazar/t101-portal-trabajadores (privado) |
| Rama que publica | `main` — cada empujón despliega solo, con GitHub Actions |
| Portal del trabajador (Taller 101) | https://t101-portal.mike-929.workers.dev |
| Panel de la empresa (Taller 101) | https://t101-portal.mike-929.workers.dev/admin |
| Panel maestro | https://roster101-central.mike-929.workers.dev/roster |
| Registro de empresa | https://roster101-central.mike-929.workers.dev |
| Versión al cerrar este chat | portal `0.9.0` · central `0.4.0` · run #27 verde |

Estructura del repositorio:

```
src/            el Worker de una empresa (Hono): index.js, lib.js, validar.js, correo.js, ficha.js, exportar.js
public/         el portal del trabajador (index.html, app.js) y el panel de la empresa (admin.html, admin.js)
                escaner.js es la cámara: recorte al marco, detección de la hoja, enderezado, filtro de escaneo, PDF
schema.sql      la base de cada empresa. Solo hace CREATE IF NOT EXISTS
migrations/     lo que schema.sql no puede: agregar columnas o tablas a una base que ya existe
central/        roster101 central: registro de empresa + panel maestro. Su propio Worker, base y bucket
clientes/       un .toml por empresa cliente. El wrangler.toml de la raíz es el de Taller 101
scripts/        clientes.mjs (la lista para el despliegue), alta-cliente.mjs, correo-*.mjs
.github/workflows/
   desplegar.yml         cada push a main: aplica esquema + migraciones, publica cada cliente y central
   alta-cliente.yml      workflow_dispatch: crea base, bucket, Worker y manda el correo. Simulacro por default
   instalar-central.yml  ya se corrió. No volver a correrlo
marca/          los logotipos. Tipografía Sansation Bold, convertida a trazos
BITACORA.md     el registro de cada versión, cómo se publica, cómo se llama cada cosa, pendientes
```

## Reglas que puso Mike

1. **"Cada vez que hagamos un cambio, cuando quede listo publicas."** Un cambio
   terminado se empuja a `main`. No se acumulan.
2. **Nunca se sube `llaves.env`** ni ninguna llave al repositorio. Ninguna clave
   se escribe en un chat, en un commit ni en la bitácora.
3. **roster101 va en minúsculas, siempre.** taller101 también.
4. Cada versión lleva su renglón en `BITACORA.md`, escrito para Mike, no para
   programadores: qué cambió y por qué, sin jerga.
5. Se sube la versión en `wrangler.toml` y `clientes/_plantilla.toml`
   (`PORTAL_VERSION`), y en `central/wrangler.toml` si central cambió.
6. Los commits van en español, con el mismo tono que la bitácora, y dicen qué se
   probó y cómo. Sin identificadores de modelo.

## Cómo se verifica un cambio (no se asume: se mide)

Todo se probó siempre contra el Worker corriendo local, nunca "debería
funcionar":

```
# Worker de una empresa, en el puerto 8787
npx wrangler dev --local --port 8787
# central, en el 8790
npx wrangler dev --local --port 8790 -c central/wrangler.toml
```

- El esquema local se aplica con `npx wrangler d1 execute t101-trabajadores --local --file=./schema.sql --yes`
  (y `roster101-central` con `-c central/wrangler.toml` para central).
- `.dev.vars` trae `SECRETO`, `CLAVE_ADMIN` y `RESEND_API_KEY` (vacía). Para que
  el código de acceso se devuelva en la respuesta en vez de mandarse por correo,
  se le agrega `MODO_PRUEBA=1` **temporalmente** y se restaura al terminar.
  Nunca se hace commit de `.dev.vars` (está en `.gitignore`).
- La pantalla se maneja con Playwright y el Chromium preinstalado:
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Los scripts de prueba
  tienen que vivir dentro de la carpeta del proyecto (para que encuentren
  `playwright`) y se borran antes del commit.
- Para la cámara: `--use-fake-device-for-media-stream`, o mejor, sobreescribir
  `navigator.mediaDevices.getUserMedia` con un `canvas.captureStream()` que
  dibuje lo que se quiera fotografiar.
- Los PDF se validan con `pypdf` (hay un venv en el scratchpad de esa sesión;
  en otra, `pip install pypdf`).
- Se mide en teléfono de 390×844 y en escritorio. Nada debe salirse de la
  pantalla ni provocar scroll horizontal. Cero errores de JavaScript.
- El despliegue se verifica leyendo el run de Actions —los tres jobs: `lista`,
  `central`, `taller101`— y su paso "Revisar que el portal responda".

Gotchas de este entorno:
- `pkill -f "wrangler dev"` mata la propia shell; se usa `pkill -f workerd`.
- Cualquier otro comando de `wrangler` (d1 execute, etc.) tumba el `wrangler dev`
  que esté corriendo: se vuelve a levantar después.
- `SendUserFile` rechaza archivos de más de ~0.8 MB.
- El `catch {}` vacío del arranque del panel se tragaba errores reales; ya se
  arregló, pero es la clase de cosa que hay que revisar cuando algo "no abre".

## Lo que el chat en la nube NO alcanza, y lo que sí

**No alcanza** (política de egreso; no se rodea, se reporta):
- `api.cloudflare.com` y `*.workers.dev` → 403 del proxy. No se puede publicar
  ni probar producción desde el chat.
- La API de secretos de Actions → 403. Los secretos del repo los pone Mike en la
  UI de GitHub.
- Google Fonts, dafont, jsDelivr, cdnjs.

**Sí alcanza:**
- **GitHub** completo, con las herramientas MCP `mcp__github__*`: leer runs,
  logs, y **disparar workflows** (`actions_run_trigger`). Por ahí se hace todo
  lo de Cloudflare: los runners sí llegan.
- **npm** (`registry.npmjs.org`). Así se consiguió Sansation
  (`@fontsource/sansation`) y así se midió OpenCV.js.

## Estado de cada cosa al cerrar este chat

**Hecho y publicado:**
- Portal del trabajador completo: acceso por código al correo, expediente por
  partes, aviso de privacidad obligatorio, documentos con cámara, datos que no
  se repiten, teléfono de emergencia distinto al propio, parentesco.
- Escáner (`public/escaner.js`, idéntico en `central/public/`): la credencial se
  recorta al marco con proporción real (85.6×54); los papeles van en marco de
  hoja carta lo más grande que quepa —con los controles al costado cuando el
  teléfono está acostado—, **se detectan solas las cuatro esquinas** (sin
  OpenCV: 12.7 MB no se le mandan a un teléfono), se endereza con homografía,
  se le quita la sombra y se guarda en **PDF**, varias hojas por documento.
  Verificado sobre documentos sintéticos y cámara falsa; **falta verlo en un
  teléfono real con una hoja real.**
- Panel de la empresa: tabla con vista completa y **compacta** (nombre +
  RFC), qué le falta a cada quien **por escribir y por entregar**, el expediente
  de cada persona se abre tocando su nombre y se puede capturar por ella
  (documentos solo se ven: no hay ruta para subir ni borrar ajenos), fichas en
  PDF con casillas de qué llevan, ZIP con documentos, papelera de 30 días,
  bitácora de movimientos con 10 casillas (accesos y expedientes; lo del panel
  se apunta pero se lee en el maestro), CSV de todo.
- **La clave del panel de la empresa ya no está en el repositorio.** Vive
  hasheada (PBKDF2) en la base del Worker. Se cambia desde el panel; con
  "Olvidé la clave" llega un código al `CORREO_AVISOS`. No se puede repetir una
  de los últimos 6 meses; la de instalación queda prohibida para siempre.
  `CLAVE_ADMIN` solo sirve para la primera entrada.
- Multi-tenant: un Worker por cliente, `clientes/*.toml`, despliegue en matriz,
  alta por workflow con simulacro.
- **roster101 central instalado** (base `abbf7f28-…`, Worker
  `roster101-central`): registro de empresa con código al correo, documentos,
  "ya terminamos" → aviso a Mike; panel maestro con contadores, invitar,
  recordar, revisar, regresar y "abrirle su portal".

**Mike tiene que hacer (no se puede desde el chat):**
1. Entrar al panel de la empresa con la clave de siempre y **ponerle una
   nueva**: hasta entonces sale en rojo "todavía estás entrando con la clave de
   instalación". Después, borrar el secreto `CLAVE_ADMIN` del repo.
2. Revisar el correo: ahí llegó la **clave del panel maestro**.
3. Poner el secreto `GITHUB_TOKEN_ALTAS` (un PAT con permiso de Actions) para
   que el botón "Abrirle su portal" dispare el alta solo. Sin él, el botón
   enseña los datos para correrla a mano — o el chat la dispara con
   `actions_run_trigger`.
4. Borrar en Resend la llave `t101-portal` (la buena es `t101-portal-envio`).
5. Rotar el token de Cloudflare (se pegó en un chat una vez).
6. Que un abogado revise el aviso de privacidad.
7. **Probar con un trabajador de verdad**, en un teléfono de verdad, antes de
   repartir la liga. En particular el escáner.

**Ideas que quedaron en el aire (Mike no las pidió; no hacerlas sin preguntar):**
- El panel maestro no enseña todavía la bitácora de "lo del panel" de cada
  empresa (quién descargó qué). Los movimientos se apuntan con `capa:'roster101'`
  en `ACCIONES_BITACORA`, pero cada empresa tiene su base aparte, así que
  leerlos desde el maestro necesita una ruta en cada Worker que el maestro
  consulte con una llave compartida.
- Estado de facturación / plan por empresa, uso, suspender.
- Correcciones de Mike a lo largo del chat que conviene tener presentes: cuando
  dijo "la plataforma de administración" se refería al panel, no al portal;
  "es roster101 en minúsculas todo"; la descarga es un PDF con todos los
  trabajadores (una hoja cada uno) más un ZIP por trabajador con su nombre.

## Cómo arrancar el chat nuevo

1. **Sin repositorio conectado también funciona** (8-sep-2026): el chat saca el
   PAT de `CONTEXTO.md` (§3.3, proyecto de Claude) a `/tmp/.gh_token` y clona con
   `https://x-access-token:$PAT@github.com/mikebalcazar/t101-portal-trabajadores.git`.
   El proxy deja pasar la credencial (probado). Push a `main` → Actions publica.
   Verificar el run con `curl -H "Authorization: Bearer $PAT"
   https://api.github.com/repos/mikebalcazar/t101-portal-trabajadores/actions/runs?per_page=1`.
   No hace falta la computadora de Mike ni que él dé clic a nada.
   Si el repo sí viene conectado, igual: *"lee `claude/continuar.md` y `BITACORA.md`"*.
2. Antes de cualquier cambio, `git log --oneline -5` y el último run de
   `desplegar.yml`: si no está verde, eso va primero.
3. Un cambio = probarlo local → bitácora → versión → commit → push a `main` →
   leer el run → contarle a Mike qué se midió, con números, y qué no se pudo
   verificar.
