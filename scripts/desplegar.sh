#!/usr/bin/env bash
# Publica el Portal de Trabajadores de Taller 101 en Cloudflare.
# Se puede correr las veces que quieras: lo que ya existe no se vuelve a crear.
set -euo pipefail
cd "$(dirname "$0")/.."

BD="t101-trabajadores"
BUCKET="t101-documentos"
W="npx wrangler"

azul(){ printf '\033[1;36m%s\033[0m\n' "$*"; }
bien(){ printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
ojo(){  printf '\033[1;33m! %s\033[0m\n' "$*"; }

azul "════ Portal de Trabajadores · Taller 101 ════"

# ── 0. llaves y dependencias ──
if [ -f llaves.env ]; then
  set -a; . ./llaves.env; set +a
  bien "Llaves cargadas de llaves.env"
fi
[ -d node_modules ] || { azul "Instalando dependencias…"; npm install; }

# ── 1. sesión de Cloudflare ──
if ! $W whoami >/dev/null 2>&1; then
  ojo "Falta iniciar sesión en Cloudflare. Se va a abrir el navegador."
  $W login
fi
bien "Sesión de Cloudflare lista: $($W whoami 2>/dev/null | grep -oE '[^ ]+@[^ ]+' | head -1 || echo 'ok')"

# ── 2. base de datos D1 ──
ID_ACTUAL=$(grep -oP 'database_id = "\K[^"]+' wrangler.toml || echo "PENDIENTE")
if [ "$ID_ACTUAL" = "PENDIENTE" ] || [ "$ID_ACTUAL" = "local-dev-placeholder" ]; then
  azul "Creando la base de datos $BD…"
  SALIDA=$($W d1 create "$BD" 2>&1 || true)
  ID=$(printf '%s' "$SALIDA" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [ -z "$ID" ]; then
    # ya existía: la buscamos en la lista
    ID=$($W d1 list --json 2>/dev/null | node -e "
      let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
        const l=JSON.parse(s).find(x=>x.name==='$BD');console.log(l?l.uuid:'');});" )
  fi
  [ -n "$ID" ] || { ojo "No pude obtener el ID de la base. Salida:"; echo "$SALIDA"; exit 1; }
  sed -i.bak "s|database_id = \".*\"|database_id = \"$ID\"|" wrangler.toml && rm -f wrangler.toml.bak
  bien "Base creada y anotada en wrangler.toml ($ID)"
else
  bien "Base de datos ya configurada ($ID_ACTUAL)"
fi

# ── 3. bucket R2 ──
if $W r2 bucket list 2>/dev/null | grep -q "$BUCKET"; then
  bien "Bucket $BUCKET ya existe"
else
  azul "Creando el bucket $BUCKET…"
  $W r2 bucket create "$BUCKET" || ojo "Si falló: entra a dash.cloudflare.com → R2 y activa R2 una vez (pide tarjeta, no cobra bajo 10 GB)."
fi

# ── 4. esquema de tablas ──
azul "Aplicando el esquema a la base remota…"
$W d1 execute "$BD" --remote --file=./schema.sql --yes >/dev/null
bien "Tablas listas"

# ── 5. publicar ──
# Va antes de los secretos: "wrangler secret put" necesita que el Worker exista.
azul "Publicando…"
$W deploy
# ── 6. secretos ──
existe_secreto(){ $W secret list 2>/dev/null | grep -q "\"$1\"" ; }

if existe_secreto SECRETO; then
  bien "SECRETO ya configurado"
else
  azul "Generando SECRETO (firma las sesiones)…"
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" | $W secret put SECRETO
  bien "SECRETO guardado"
fi

if existe_secreto CLAVE_ADMIN; then
  bien "CLAVE_ADMIN ya configurada (para cambiarla: npx wrangler secret put CLAVE_ADMIN)"
else
  ojo "Escribe la clave de administración (la que usará el equipo de admin en /admin.html):"
  $W secret put CLAVE_ADMIN
fi

if existe_secreto RESEND_API_KEY; then
  bien "RESEND_API_KEY ya configurada"
else
  ojo "Pega la llave de Resend (empieza con re_). Si todavía no la tienes, deja vacío y ejecuta después:"
  ojo "   npx wrangler secret put RESEND_API_KEY"
  read -r -p "   Llave de Resend: " LLAVE || true
  if [ -n "${LLAVE:-}" ]; then printf '%s' "$LLAVE" | $W secret put RESEND_API_KEY; bien "Llave guardada"; fi
fi


echo
bien "Portal publicado."
azul "Siguientes pasos:"
cat <<'FIN'
  1. Abre la URL que imprimió arriba (termina en .workers.dev) y pruébala.
  2. Para trabajadores.taller101.mx:
     Cloudflare → Workers & Pages → t101-portal → Settings → Domains & Routes
     → Add → Custom domain → trabajadores.taller101.mx
     (si el DNS de taller101.mx no está en Cloudflare, primero hay que
      mover los nameservers o crear un CNAME según indique el panel)
  3. Correo: en resend.com → Domains, agrega taller101.mx y copia los
     registros DNS que te dé (SPF/DKIM). Sin eso, los correos no salen.
FIN
