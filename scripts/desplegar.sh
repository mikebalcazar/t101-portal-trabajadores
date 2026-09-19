#!/usr/bin/env bash
# Publica el portal de Taller 101 en Cloudflare desde una computadora. Lo normal
# es no usarlo: cada empujón a main lo publica GitHub Actions (staging, humo,
# producción, medición). Desde el 19-sep no hay base ni bucket que crear ni
# secretos que poner: los datos viven en la suite.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install
npx wrangler whoami >/dev/null 2>&1 || npx wrangler login
npx wrangler deploy
echo "Publicado. Comprueba: curl -fsS https://t101-portal.mike-929.workers.dev/api/salud"
