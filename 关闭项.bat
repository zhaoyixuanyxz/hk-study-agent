@echo off
rem IMPORTANT: Save as ANSI or UTF-8 WITHOUT BOM. UTF-8 BOM breaks cmd.
setlocal EnableExtensions
chcp 65001 >nul 2>&1

set "PROJ=%~dp0"
if "%PROJ:~-1%"=="\" set "PROJ=%PROJ:~0,-1%"

cd /d "%PROJ%" 2>nul

echo.
echo ============================================================
echo   Study Agent - Stop all services
echo ============================================================
echo.

taskkill /FI "WINDOWTITLE eq StudyAgent-API-8010*" /T /F >nul 2>&1
if not errorlevel 1 echo [OK] Closed StudyAgent API window
taskkill /FI "WINDOWTITLE eq StudyAgent-Web-5180*" /T /F >nul 2>&1
if not errorlevel 1 echo [OK] Closed StudyAgent Web window
taskkill /FI "WINDOWTITLE eq StudyAgent-Preflight*" /T /F >nul 2>&1

echo [*] Stopping processes on ports 8010, 5180...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ%\scripts\stop-ports.ps1" -Ports 8010,5180

set "STOP_POSTGRES=1"
if exist "%PROJ%\.env" (
  findstr /B /C:"STOP_POSTGRES=0" "%PROJ%\.env" >nul && set "STOP_POSTGRES=0"
)

if "%STOP_POSTGRES%"=="1" (
  where docker >nul 2>&1
  if not errorlevel 1 (
    echo [*] Stopping Docker postgres...
    pushd "%PROJ%"
    docker compose stop postgres 2>nul
    popd
    echo [OK] Postgres container stopped.
  )
)

echo.
echo [*] Verifying ports...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ%\scripts\check-ports-free.ps1" -Ports 8010,5180

echo.
echo All stop steps finished.
echo.
pause
exit /b 0
