@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions

rem UTF-8 BOM above: required so cmd parses Chinese correctly on Windows.

set "PROJ=%~dp0"
if "%PROJ:~-1%"=="\" set "PROJ=%PROJ:~0,-1%"

cd /d "%PROJ%" 2>nul
if errorlevel 1 (
  echo [ERROR] Cannot cd to project folder.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from nodejs.org ^(LTS^).
  pause
  exit /b 1
)

if not exist "%PROJ%\backend\node_modules\" (
  echo [*] Installing backend dependencies...
  pushd "%PROJ%\backend"
  call npm install
  if errorlevel 1 (
    echo [ERROR] backend npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

if not exist "%PROJ%\frontend\node_modules\" (
  echo [*] Installing frontend dependencies...
  pushd "%PROJ%\frontend"
  call npm install
  if errorlevel 1 (
    echo [ERROR] frontend npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

set "URL_UI=http://127.0.0.1:5180/"
set "URL_API=http://127.0.0.1:8010"

echo.
echo ============================================================
echo   Study Agent - start backend + frontend
echo ------------------------------------------------------------
echo   Data file: backend\data\db.json
echo   No separate DB server ^(MySQL, Postgres, etc.^) needed.
echo ------------------------------------------------------------
echo   API : %URL_API%  ^(Vite proxies api routes here^)
echo   UI  : %URL_UI%
echo ============================================================
echo.

echo [*] Starting API in new window...
start "StudyAgent-API-8010" /D "%PROJ%\backend" cmd /k npm start

timeout /t 2 /nobreak >nul

echo [*] Starting Vite in new window...
start "StudyAgent-Web-5180" /D "%PROJ%\frontend" cmd /k npm run dev

echo.
echo [*] Waiting for port 5180 ^(max 60 seconds^)...
echo     If this times out, read errors in window "StudyAgent-Web-5180".
powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i=0; $i -lt 60; $i++) { try { $c = New-Object System.Net.Sockets.TcpClient; $c.ReceiveTimeout = 800; $c.SendTimeout = 800; $c.Connect('127.0.0.1', 5180); $c.Close(); Write-Host '[OK] Port 5180 is listening.'; exit 0 } catch { Start-Sleep -Seconds 1 } }; Write-Host '[WARN] Port 5180 still closed - check the Vite window.'; exit 1"

echo.
echo ------------------------------------------------------------
echo   Opening browser at %URL_UI%
echo   If you see ERR_CONNECTION_REFUSED: use port 5180 ^(not default port 80^).
echo ------------------------------------------------------------
echo.

start "" "%URL_UI%"

echo Done. Close the two titled windows to stop servers.
echo.
pause
