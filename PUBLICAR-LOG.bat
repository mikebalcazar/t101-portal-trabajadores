@echo off
cd /d "%~dp0"
echo INICIO %DATE% %TIME% > "%~dp0publicar.log"
where node >> "%~dp0publicar.log" 2>&1
echo. | powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\desplegar.ps1" >> "%~dp0publicar.log" 2>&1
echo === TERMINO codigo %ERRORLEVEL% >> "%~dp0publicar.log"
