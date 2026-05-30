@echo off
rem IMPORTANT: Save as ANSI or UTF-8 WITHOUT BOM. UTF-8 BOM breaks cmd and causes instant exit.
setlocal EnableExtensions
chcp 65001 >nul 2>&1

set "PROJ=%~dp0"
if "%PROJ:~-1%"=="\" set "PROJ=%PROJ:~0,-1%"

cd /d "%PROJ%" 2>nul
if errorlevel 1 (
  echo [ERROR] Cannot cd to project folder:
  echo   %PROJ%
  goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install LTS from https://nodejs.org/
  goto :fail
)

set "URL_UI=http://127.0.0.1:5180/"
set "OPEN_BROWSER=1"
if exist "%PROJ%\.env" (
  findstr /B /C:"STARTUP_OPEN_BROWSER=0" "%PROJ%\.env" >nul && set "OPEN_BROWSER=0"
)

echo.
echo ============================================================
echo   Study Agent - Preflight + Start
echo ============================================================
echo.

rem --- 1) PostgreSQL (Docker, optional) ---
set "START_POSTGRES=1"
if exist "%PROJ%\.env" (
  findstr /B /C:"START_POSTGRES=0" "%PROJ%\.env" >nul && set "START_POSTGRES=0"
)

if "%START_POSTGRES%"=="1" (
  where docker >nul 2>&1
  if not errorlevel 1 (
    echo [*] Checking PostgreSQL ^(Docker port 5433^)...
    docker compose -f "%PROJ%\docker-compose.yml" ps postgres 2>nul | findstr /I "running" >nul
    if errorlevel 1 (
      echo [*] Starting postgres container...
      pushd "%PROJ%"
      docker compose up -d postgres
      if errorlevel 1 (
        echo [WARN] Docker postgres failed to start - continuing ^(app uses db.json^).
      )
      popd
      ping 127.0.0.1 -n 4 >nul
    ) else (
      echo [OK] Postgres container already running.
    )
  ) else (
    echo [SKIP] Docker not found - Postgres not started ^(app uses db.json^).
  )
) else (
  echo [SKIP] START_POSTGRES=0 in .env
)

rem --- 2) npm dependencies ---
if not exist "%PROJ%\backend\node_modules\" (
  echo [*] Installing backend dependencies...
  pushd "%PROJ%\backend"
  call npm install
  if errorlevel 1 (
    echo [ERROR] backend npm install failed.
    popd
    goto :fail
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
    goto :fail
  )
  popd
)

rem --- 3) Quick preflight (no crawl - opens browser sooner) ---
echo.
echo [*] Quick preflight ^(feed sync + repair only^)...
echo     Full crawl runs in background after UI starts.
echo.

set "PREFLIGHT_ARGS=--quick"
if /I "%~1"=="--force-crawl" set "PREFLIGHT_ARGS=--quick --force-crawl"
if /I "%~2"=="--force-crawl" set "PREFLIGHT_ARGS=--quick --force-crawl"

pushd "%PROJ%\backend"
call node scripts/startup-preflight.mjs %PREFLIGHT_ARGS%
popd

rem --- 4) Free stale ports from last run ---
echo [*] Releasing ports 8010 / 5180 if still occupied...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ%\scripts\stop-ports.ps1" -Ports 8010,5180
taskkill /FI "WINDOWTITLE eq StudyAgent-API-8010*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq StudyAgent-Web-5180*" /T /F >nul 2>&1
ping 127.0.0.1 -n 2 >nul

rem --- 5) Start API + Web ---
echo.
echo ============================================================
echo   Starting services
echo ------------------------------------------------------------
echo   UI   : %URL_UI%
echo   API  : http://127.0.0.1:8010
echo   Stop : double-click shutdown bat in project root
echo ============================================================
echo.

echo [*] Starting API in new window...
start "StudyAgent-API-8010" /D "%PROJ%\backend" cmd /k npm start

ping 127.0.0.1 -n 3 >nul

echo [*] Starting Vite in new window...
start "StudyAgent-Web-5180" /D "%PROJ%\frontend" cmd /k npm run dev

rem --- 6) Wait for frontend then open browser ---
echo.
echo [*] Waiting for frontend port 5180 ^(max 60s^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ%\scripts\wait-ports.ps1" -Ports 5180 -MaxSeconds 60

if "%OPEN_BROWSER%"=="1" (
  echo.
  echo [*] Opening browser: %URL_UI%
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ%\scripts\open-browser.ps1" -Url "%URL_UI%"
  if errorlevel 1 (
    echo [WARN] Auto-open failed. Please open manually: %URL_UI%
    start "" "%URL_UI%"
  )
) else (
  echo [SKIP] STARTUP_OPEN_BROWSER=0 - open %URL_UI% manually
)

echo [*] Waiting for API port 8010 ^(max 30s^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ%\scripts\wait-ports.ps1" -Ports 8010 -MaxSeconds 30

rem --- 7) Background intelligence crawl ---
set "BG_CRAWL=1"
if exist "%PROJ%\.env" (
  findstr /B /C:"STARTUP_INTEL_CRAWL=0" "%PROJ%\.env" >nul && set "BG_CRAWL=0"
)
if "%BG_CRAWL%"=="1" (
  echo [*] Starting background intelligence crawl...
  set "CRAWL_EXTRA="
  if /I "%~1"=="--force-crawl" set "CRAWL_EXTRA=--force-crawl"
  if /I "%~2"=="--force-crawl" set "CRAWL_EXTRA=--force-crawl"
  start "StudyAgent-Preflight" /D "%PROJ%\backend" cmd /k node scripts/startup-preflight.mjs --crawl-only %CRAWL_EXTRA%
)

echo.
echo Done. Browser should show %URL_UI%
echo Use shutdown bat in project root to stop all services.
goto :done

:fail
echo.
echo Startup aborted.
:done
echo.
pause
exit /b 0
