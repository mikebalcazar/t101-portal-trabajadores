#!/usr/bin/env bash
# Corre el portal en tu computadora para probar cambios antes de publicar.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install
npx wrangler d1 execute t101-trabajadores --local --file=./schema.sql --yes >/dev/null
echo "Portal en http://localhost:8788   ·   Admin en http://localhost:8788/admin.html (clave: admin123)"
echo "El código de acceso NO se manda por correo: aparece en la respuesta y en la consola."
npx wrangler dev --port 8788 --local --var MODO_PRUEBA:1 --var SECRETO:pruebalocal123 --var CLAVE_ADMIN:admin123
