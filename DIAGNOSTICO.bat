@echo off
title Diagnostico - Portal Taller 101
cd /d "%~dp0"
set INFO=%~dp0diagnostico.txt

echo Revisando tu computadora... (10 segundos)

echo ===== DIAGNOSTICO %DATE% %TIME% =====> "%INFO%"
echo.>> "%INFO%"
echo --- Carpeta ------------------------------->> "%INFO%"
cd >> "%INFO%" 2>&1
dir /b >> "%INFO%" 2>&1
echo.>> "%INFO%"
echo --- Node -------------------------------->> "%INFO%"
where node >> "%INFO%" 2>&1
node -v >> "%INFO%" 2>&1
echo.>> "%INFO%"
echo --- npm --------------------------------->> "%INFO%"
where npm >> "%INFO%" 2>&1
npm -v >> "%INFO%" 2>&1
echo.>> "%INFO%"
echo --- PowerShell -------------------------->> "%INFO%"
powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()" >> "%INFO%" 2>&1
echo.>> "%INFO%"
echo --- wrangler whoami --------------------->> "%INFO%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content llaves.env ^| ForEach-Object { $l=$_.Trim(); if($l -and -not $l.StartsWith('#') -and $l.Contains('=')){ $i=$l.IndexOf('='); $k=$l.Substring(0,$i).Trim(); $v=$l.Substring($i+1).Trim(); if($v){ Set-Item -Path ('Env:'+$k) -Value $v } } }; npx wrangler whoami" >> "%INFO%" 2>&1
echo.>> "%INFO%"
echo --- wrangler deploy (prueba) ------------>> "%INFO%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content llaves.env ^| ForEach-Object { $l=$_.Trim(); if($l -and -not $l.StartsWith('#') -and $l.Contains('=')){ $i=$l.IndexOf('='); $k=$l.Substring(0,$i).Trim(); $v=$l.Substring($i+1).Trim(); if($v){ Set-Item -Path ('Env:'+$k) -Value $v } } }; npx wrangler deploy" >> "%INFO%" 2>&1
echo.>> "%INFO%"
echo ===== FIN =====>> "%INFO%"

echo.
type "%INFO%"
echo.
echo  Se guardo en: %INFO%
echo  Pasale ESE archivo a Claude.
echo.
pause
