# Cómo trabajamos en este proyecto

Esta carpeta es la casa del **Portal de Trabajadores de Taller 101**.
Aquí vive el código y aquí viven tus llaves. No hace falta que la abras nunca,
pero si algún día quieres, todo está aquí.

## Las llaves

El archivo **`llaves.env`** guarda los accesos. No se sube a internet, no sale de
tu computadora, y lo lee Claude cada vez que empezamos una sesión para poder
publicar sin que le repitas nada.

Si un archivo `llaves.env` no existe todavía, copia `llaves.env.ejemplo`,
renómbralo a `llaves.env` y pega tus valores.

Para invalidar un acceso: entra al panel del servicio (Cloudflare o Resend),
borra el token y crea uno nuevo. El viejo muere en ese momento.

## Publicar una versión nueva

En una sesión con Claude, basta decir: *"publica los cambios"*.
Claude lee `llaves.env`, aplica los cambios y despliega.

Si lo quieres hacer tú desde una terminal en esta carpeta:

```
npm install
bash scripts/desplegar.sh
```

## Probar antes de publicar

```
bash scripts/local.sh
```

Abre `http://localhost:8788`. El código de acceso sale en pantalla, no por correo.

## Qué es cada carpeta

| Carpeta | Qué hay |
|---|---|
| `src/` | El servidor: rutas, validaciones, correos, exportación |
| `public/` | Lo que ve el trabajador y el panel de administración |
| `scripts/` | `desplegar.sh` publica, `local.sh` prueba en tu compu |
| `schema.sql` | Las tablas de la base de datos |
| `README.md` | Qué hace el portal, con detalle |

## Historial

Cada versión publicada queda registrada en `BITACORA.md`, con la fecha y qué cambió.
