@echo off
title Subir el Portal de Trabajadores a GitHub
cd /d "%~dp0"
echo.
echo  Subiendo el Portal de Trabajadores a GitHub...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\subir-github.ps1"
echo.
echo  Si algo fallo, el detalle esta en:  subir-github.log
echo.
pause
