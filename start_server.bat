@echo off
cd /d "%~dp0"

set "CODEX_PYTHON=C:\Users\Abdelaziz\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%CODEX_PYTHON%" (
  "%CODEX_PYTHON%" server.py
  goto :end
)

py --version >nul 2>nul
if not errorlevel 1 (
  py server.py
  goto :end
)

python --version >nul 2>nul
if not errorlevel 1 (
  python server.py
  goto :end
)

echo Kein funktionierendes Python wurde gefunden.
echo Der konfigurierte Pfad lautet: %CODEX_PYTHON%

:end
pause
