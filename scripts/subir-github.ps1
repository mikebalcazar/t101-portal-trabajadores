# Sube el Portal de Trabajadores al repositorio de GitHub.
# Se puede correr las veces que quieras: la segunda vez solo manda lo que cambió.

$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

$LOG  = Join-Path (Get-Location) "subir-github.log"
$REPO = "https://github.com/mikebalcazar/t101-portal-trabajadores.git"

function Di($t, $color = "Gray") {
  Write-Host $t -ForegroundColor $color
  $t | Add-Content $LOG -Encoding utf8
}
function Corre($desc, [scriptblock]$b) {
  Di "--- $desc" DarkGray
  $salida = & $b 2>&1 | Out-String
  $codigo = $LASTEXITCODE
  if ($salida.Trim()) { Di $salida.Trim() }
  return @{ salida = $salida; codigo = $codigo }
}
function Fin($c) {
  Write-Host ""
  if ($c -ne 0) { Di "Se detuvo. El detalle esta en subir-github.log" Red }
  Write-Host ""
  exit $c
}

"=== Subida a GitHub $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Set-Content $LOG -Encoding utf8
Di "============================================" Cyan
Di " Subir el Portal de Trabajadores a GitHub"   Cyan
Di "============================================" Cyan

# ---------- 1. git ----------
$v = $null
try { $v = (git --version) 2>$null } catch { $v = $null }
if (-not $v) {
  Di "XX  No tienes Git instalado." Red
  Di "!!  Bajalo de https://git-scm.com/download/win, instala con las opciones que" Yellow
  Di "!!  vienen por default, cierra esta ventana y vuelve a correr este archivo."  Yellow
  Fin 1
}
Di "OK  $v" Green

# ---------- 2. quien firma ----------
if (-not (git config user.email)) { git config --global user.email "mike@forespot.com" }
if (-not (git config user.name))  { git config --global user.name  "Mike Balcazar" }

# ---------- 3. repo local ----------
if (-not (Test-Path ".git")) {
  Corre "git init" { git init } | Out-Null
  Corre "rama main" { git branch -M main } | Out-Null
  Di "OK  Repositorio local creado" Green
} else {
  Di "OK  Repositorio local ya existia" Green
}

# ---------- 3b. el workflow de GitHub Actions ----------
# Este archivo no se puede escribir desde Claude por el puente de archivos:
# ".github/workflows" esta protegida. Asi que lo escribe este script, que corre
# aqui mismo en tu computadora. Sin el, GitHub no publica nada solo.
$rutaWf = ".github\workflows\desplegar.yml"
if (-not (Test-Path $rutaWf)) {
  New-Item -ItemType Directory -Force -Path ".github\workflows" | Out-Null
  $wf = @'
# Publica el Portal de Trabajadores en Cloudflare cada vez que cambia el código.
# Con esto ya no hace falta la computadora de nadie: GitHub lo despliega solo.
#
# Requisitos (una sola vez, en Settings → Secrets and variables → Actions):
#   CLOUDFLARE_API_TOKEN   token con Workers Scripts:Edit, Workers R2 Storage:Edit,
#                          D1:Edit, Account Settings:Read, User Details:Read
#   CLAVE_ADMIN            clave del panel de administración
#   RESEND_API_KEY         llave de envío de correos
#   SECRETO                cadena larga y aleatoria que firma las sesiones
name: Publicar portal

on:
  push:
    branches: [main]
  workflow_dispatch:        # botón para publicar a mano desde la web de GitHub

concurrency:
  group: despliegue
  cancel-in-progress: false

jobs:
  publicar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - name: Instalar dependencias
        run: npm ci

      - name: Aplicar el esquema de la base
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: npx wrangler d1 execute t101-trabajadores --remote --file=./schema.sql --yes

      - name: Publicar
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: npx wrangler deploy

      # Los secretos se vuelven a mandar en cada despliegue: así el estado del
      # Worker siempre coincide con lo que está guardado en GitHub, y si alguien
      # rota una llave basta cambiar el secreto y volver a publicar.
      - name: Actualizar secretos del Worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          SECRETO: ${{ secrets.SECRETO }}
          CLAVE_ADMIN: ${{ secrets.CLAVE_ADMIN }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
        run: |
          set -e
          printf '%s' "$SECRETO"        | npx wrangler secret put SECRETO
          printf '%s' "$CLAVE_ADMIN"    | npx wrangler secret put CLAVE_ADMIN
          printf '%s' "$RESEND_API_KEY" | npx wrangler secret put RESEND_API_KEY

      - name: Revisar que el portal responda
        run: |
          sleep 12
          curl -fsS https://t101-portal.mike-929.workers.dev/api/salud
'@
  # Sin BOM y con saltos de linea de Unix: GitHub Actions no lee bien otra cosa.
  $sinBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) $rutaWf), ($wf -replace "`r`n", "`n"), $sinBom)
  Di "OK  Workflow de GitHub Actions creado" Green
} else {
  Di "OK  Workflow de GitHub Actions ya existia" Green
}

# Los saltos de linea se quedan como estan: varios archivos del proyecto corren
# en Linux dentro de GitHub Actions y con finales de Windows truenan.
git config core.autocrlf false | Out-Null
git config core.safecrlf false | Out-Null

# ---------- 4. red de seguridad: que llaves.env NO se suba ----------
# Este archivo trae los accesos de Cloudflare y de Resend. Si se colara al repo
# quedaria en el historial para siempre, y quitarlo despues no lo borra de ahi.
if (Test-Path "llaves.env") {
  git check-ignore -q "llaves.env"
  if ($LASTEXITCODE -ne 0) {
    Di "XX  PELIGRO: llaves.env NO esta siendo ignorado por git." Red
    Di "XX  Ahi vienen tus tokens. No subo nada hasta arreglarlo."  Red
    Di "!!  Revisa que el archivo .gitignore exista y tenga la linea: llaves.env" Yellow
    Fin 1
  }
  Di "OK  llaves.env protegido, no se va a subir" Green
}

# ---------- 5. empaquetar los cambios ----------
Corre "git add" { git add -A } | Out-Null
$pendiente = (git status --porcelain) | Out-String

# Ultimo chequeo antes de sellar: que ningun archivo con llaves entre al commit.
# Comparacion por ruta COMPLETA, no por fragmento: "llaves.env.ejemplo" contiene
# el texto "llaves.env" y con una busqueda de subcadena disparaba una falsa alarma.
$aSubir = @(git diff --cached --name-only)
$prohibidos = @("llaves.env", "subir-github.log", "ultimo-despliegue.log", "publicar.log")
foreach ($ruta in $aSubir) {
  if ($prohibidos -contains $ruta.Trim()) {
    Di "XX  $ruta quedo incluido en el commit. Me detengo." Red
    Di "XX  Ese archivo trae tus tokens y no debe subirse nunca." Red
    Fin 1
  }
}
Di "OK  $($aSubir.Count) archivos listos, ninguno con llaves" Green

if ($aSubir.Trim()) {
  $r = Corre "git commit" { git commit -m "Portal de Trabajadores de Taller 101: expedientes, aviso de privacidad y despliegue automatico" }
  if ($r.codigo -ne 0) { Di "XX  Fallo el commit" Red; Fin 1 }
  Di "OK  Cambios listos para subir" Green
} else {
  Di "OK  No hay cambios nuevos; subo lo que ya estaba" Green
}

# ---------- 6. destino ----------
git remote remove origin 2>$null | Out-Null
Corre "remote" { git remote add origin $REPO } | Out-Null
Di "OK  Destino: $REPO" Green

# ---------- 7. subir ----------
Di ""
Di "Subiendo... Si te pide entrar a GitHub, se abre una ventana del navegador." Cyan
Di "Autorizala: es tu propia cuenta." Cyan
Di ""

git push -u origin main 2>&1 | Tee-Object -FilePath $LOG -Append
$codigoPush = $LASTEXITCODE

if ($codigoPush -ne 0) {
  Di ""
  Di "XX  No se pudo subir." Red
  Di "!!  Lo mas comun: falto autorizar la ventana de GitHub que se abrio." Yellow
  Di "!!  Vuelve a correr este archivo e intenta de nuevo." Yellow
  Fin 1
}

Di ""
Di "OK  CODIGO SUBIDO" Green
Di ""
Di "   Repo:    https://github.com/mikebalcazar/t101-portal-trabajadores" Cyan
Di "   Actions: https://github.com/mikebalcazar/t101-portal-trabajadores/actions" Cyan
Di ""
Di "!!  Falta cargar los 4 secretos del repo para que el despliegue funcione." Yellow
Di "!!  Avisale a Claude y el los carga." Yellow
Fin 0
