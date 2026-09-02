@echo off
title Publicar Portal de Trabajadores - Taller 101
cd /d "%~dp0"

echo.
echo  Publicando el Portal de Trabajadores de Taller 101...
echo  (todo queda grabado en ultimo-despliegue.log)
echo.

REM cmd redirige a fuerza: aunque PowerShell truene, el log se escribe.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\desplegar.ps1" > "%~dp0ultimo-despliegue.log" 2>&1

echo.
echo ================== RESULTADO ==================
type "%~dp0ultimo-despliegue.log"
echo ===============================================
echo.
echo  El detalle completo quedo en:
echo     %~dp0ultimo-despliegue.log
echo  Pasale ese archivo a Claude.
echo.
pause
