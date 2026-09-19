#!/usr/bin/env bash
# El portal ya no corre solo en tu computadora: desde el 19-sep no tiene base
# propia, y su puerta es la suite 101, que llega por un *service binding* que
# sólo existe en Cloudflare. Para probar cambios de pantalla está
# pruebas/0101 (sirve public/ y simula /api/*); para probar el portal entero
# está staging: https://t101-portal-staging.mike-929.workers.dev (empresa demo,
# el código de acceso sale en la respuesta).
echo "roster101 no corre en local desde el 19-sep: usa staging (t101-portal-staging) o npm run prueba."
exit 1
