from pathlib import Path

cmd = Path("/mnt/data/run_frontend_fixed.cmd")
cmd.write_text(r'''@echo off
setlocal
title Weather NN Presentation

cd /d "%~dp0"

echo ==========================================
echo       WEATHER NN PRESENTATION
echo ==========================================
echo.

if not exist "index.html" (
    echo ERROR: index.html was not found.
    echo.
    echo This CMD file must be inside:
    echo weather-nn-presentation
    echo.
    pause
    exit /b 1
)

echo Opening presentation...
start "" "%~dp0index.html"

echo.
echo Presentation opened in your default browser.
echo.
exit /b 0
''', encoding="utf-8")

print(f"Created: {cmd}")
