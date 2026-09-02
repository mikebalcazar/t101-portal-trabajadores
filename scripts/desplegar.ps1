# Publica el Portal de Trabajadores de Taller 101 en Cloudflare.
# Uso: doble clic en PUBLICAR.bat  (o  .\scripts\desplegar.ps1  desde PowerShell)
# Se puede correr las veces que quieras: lo que ya existe no se vuelve a crear.
# Todo lo que pasa queda escrito en  ultimo-despliegue.log

$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

# El .bat ya redirige TODA la salida a ultimo-despliegue.log. Si aqui tambien
# escribieramos en ese archivo, Windows lo tendria abierto dos veces y PowerShell
# tiraria "el proceso no puede obtener acceso al archivo" en cada linea.
$LOG = Join-Path (Get-Location) "ultimo-despliegue.log"   # lo escribe el .bat, no este script
Write-Host "=== Despliegue $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="

function Apunta($t){ }
function Azul($t){ Write-Host $t -ForegroundColor Cyan;   Apunta $t }
function Bien($t){ Write-Host "OK  $t" -ForegroundColor Green;  Apunta "OK  $t" }
function Ojo($t){  Write-Host "!!  $t" -ForegroundColor Yellow; Apunta "!!  $t" }
function Mal($t){  Write-Host "XX  $t" -ForegroundColor Red;    Apunta "XX  $t" }

# Corre un comando, lo muestra en pantalla Y lo guarda en el log.
function Corre($desc, [scriptblock]$bloque) {
  Apunta "--- $desc"
  $salida = & $bloque 2>&1 | Out-String
  $codigo = $LASTEXITCODE
  Write-Host $salida
  Apunta $salida
  return @{ salida = $salida; codigo = $codigo }
}

# Cierra SIEMPRE con pausa, pase lo que pase.
function Fin($codigo) {
  Write-Host ""
  if ($codigo -ne 0) {
    Mal "Algo fallo. El detalle completo quedo en:"
    Write-Host "    $LOG" -ForegroundColor Yellow
    Write-Host ""
    Ojo "Pasale ese archivo a Claude (esta en la carpeta t101w) y lo resuelve."
  }
  Write-Host ""
  exit $codigo
}

$BD     = "t101-trabajadores"
$BUCKET = "t101-documentos"

Azul "============================================"
Azul " Portal de Trabajadores - Taller 101"
Azul "============================================"
Apunta "Carpeta: $(Get-Location)"

# ---------- 0. Node ----------
$v = $null
try { $v = (node -v) 2>$null } catch { $v = $null }
if (-not $v) {
  Mal "No encontre Node.js en esta computadora."
  Ojo "Instalalo de https://nodejs.org (boton LTS). Luego cierra esta ventana,"
  Ojo "abrela otra vez y vuelve a dar doble clic en PUBLICAR.bat"
  Fin 1
}
Bien "Node.js $v"

# ---------- 1. llaves ----------
if (-not (Test-Path "llaves.env")) {
  Mal "Falta el archivo llaves.env en esta carpeta."
  Fin 1
}
Get-Content "llaves.env" | ForEach-Object {
  $linea = $_.Trim()
  if ($linea -and -not $linea.StartsWith("#") -and $linea.Contains("=")) {
    $i = $linea.IndexOf("=")
    $clave = $linea.Substring(0, $i).Trim()
    $valor = $linea.Substring($i + 1).Trim()
    if ($valor) { Set-Item -Path "Env:$clave" -Value $valor }
  }
}
if (-not $env:CLOUDFLARE_API_TOKEN) { Mal "llaves.env no trae CLOUDFLARE_API_TOKEN."; Fin 1 }
Bien "Llaves cargadas"

# ---------- 2. dependencias ----------
if (-not (Test-Path "node_modules")) {
  Azul "Instalando dependencias (tarda un minuto la primera vez)..."
  $r = Corre "npm install" { npm install --no-fund --no-audit }
  if ($r.codigo -ne 0) { Mal "Fallo npm install"; Fin 1 }
}
Bien "Dependencias listas"

# ---------- 3. token ----------
Azul "Verificando el token de Cloudflare..."
$r = Corre "wrangler whoami" { npx wrangler whoami }
if ($r.codigo -ne 0) {
  Mal "El token no sirvio."
  Ojo "Necesita: Workers Scripts Edit, Workers R2 Storage Edit, D1 Edit, Account Settings Read, User Details Read."
  Fin 1
}
Bien "Token valido"

# ---------- 4. base de datos D1 ----------
$toml = Get-Content "wrangler.toml" -Raw
$idActual = [regex]::Match($toml, 'database_id = "([^"]*)"').Groups[1].Value
if ($idActual -eq "PENDIENTE" -or $idActual -eq "local-dev-placeholder" -or -not $idActual) {
  Azul "Creando la base de datos $BD..."
  $r = Corre "d1 create" { npx wrangler d1 create $BD }
  $id = [regex]::Match($r.salida, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}').Value
  if (-not $id) {
    Azul "Parece que ya existia; la busco en tu cuenta..."
    $r2 = Corre "d1 list" { npx wrangler d1 list --json }
    try { $id = ($r2.salida | ConvertFrom-Json | Where-Object { $_.name -eq $BD }).uuid } catch { $id = $null }
  }
  if (-not $id) { Mal "No pude obtener el ID de la base."; Fin 1 }
  $nuevo = (Get-Content "wrangler.toml" -Raw) -replace 'database_id = "[^"]*"', "database_id = `"$id`""
  $sinBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) "wrangler.toml"), $nuevo, $sinBom)
  Bien "Base creada ($id)"
} else {
  Bien "Base de datos ya configurada"
}

# ---------- 5. bucket R2 ----------
$r = Corre "r2 bucket list" { npx wrangler r2 bucket list }
if ($r.salida -match [regex]::Escape($BUCKET)) {
  Bien "Bucket $BUCKET ya existe"
} else {
  Azul "Creando el bucket $BUCKET..."
  $r = Corre "r2 bucket create" { npx wrangler r2 bucket create $BUCKET }
  if ($r.codigo -ne 0) {
    Mal "No se pudo crear el bucket."
    Ojo "Lo mas probable: falta activar R2 una vez en dash.cloudflare.com -> R2 Object Storage."
    Ojo "Pide registrar tarjeta, pero no cobra nada por debajo de 10 GB."
    Fin 1
  }
  Bien "Bucket creado"
}

# ---------- 6. tablas ----------
Azul "Aplicando el esquema a la base remota..."
$r = Corre "d1 execute schema" { npx wrangler d1 execute $BD --remote --file=./schema.sql --yes }
if ($r.codigo -ne 0) { Mal "Fallo al aplicar el esquema"; Fin 1 }
Bien "Tablas listas"

# ---------- 7. publicar ----------
# Va ANTES de los secretos: "wrangler secret put" necesita que el Worker ya exista.
Azul "Publicando el portal..."
$r = Corre "wrangler deploy" { npx wrangler deploy }
if ($r.codigo -ne 0) {
  Mal "Fallo el despliegue. Arriba esta lo que dijo Cloudflare."
  Fin 1
}
Bien "Worker publicado"
$salidaDeploy = $r.salida

# ---------- 8. secretos ----------
$r = Corre "secret list" { npx wrangler secret list }
$secretos = $r.salida

function PonSecreto($nombre, $valor) {
  Apunta "--- secret put $nombre"
  # Ojo: nada de Add-Content al log aqui. El .bat ya tiene ese archivo abierto y
  # Windows no deja escribirlo dos veces; eso llenaba la pantalla de errores falsos.
  $valor | npx wrangler secret put $nombre 2>&1 | Out-String | Write-Host
  if ($LASTEXITCODE -eq 0) { Bien "$nombre guardado" } else { Mal "No se pudo guardar $nombre" }
}

if ($secretos -match '"SECRETO"') {
  Bien "SECRETO ya configurado"
} else {
  Azul "Generando SECRETO (firma las sesiones)..."
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  PonSecreto "SECRETO" ([Convert]::ToBase64String($bytes))
}

if ($env:CLAVE_ADMIN) { PonSecreto "CLAVE_ADMIN" $env:CLAVE_ADMIN }
elseif ($secretos -match '"CLAVE_ADMIN"') { Bien "CLAVE_ADMIN ya configurada" }
else { Ojo "Sin CLAVE_ADMIN: no vas a poder entrar al panel de administracion." }

if ($env:RESEND_API_KEY) { PonSecreto "RESEND_API_KEY" $env:RESEND_API_KEY }
elseif ($secretos -match '"RESEND_API_KEY"') { Bien "RESEND_API_KEY ya configurada" }
else { Ojo "Sin RESEND_API_KEY todavia: los correos NO se envian (el resto si funciona)." }

# ---------- 9. resultado ----------
$url = [regex]::Match($salidaDeploy, 'https://[a-z0-9.\-]+workers\.dev').Value
Write-Host ""
Bien "PORTAL PUBLICADO"
if ($url) {
  Azul ""
  Azul "   Portal:  $url"
  Azul "   Admin:   $url/admin"
  Azul ""
} else {
  Ojo "No pude leer la direccion. Buscala en el log o en dash.cloudflare.com -> Workers."
}
Ojo "El log completo quedo en: ultimo-despliegue.log"
Ojo "Pasaselo a Claude para que verifique que todo quedo bien."
Fin 0
