@echo off
setlocal
cd /d "%~dp0"
echo Membuka Panel Autohadir Cloud (SK Paya Redan)...
set "PYEXE="
rem Skip Microsoft Store Python: it virtualizes LOCALAPPDATA owner key files.
for /d %%D in ("%LOCALAPPDATA%\hermes\tools\python-*-win32-x64") do if not defined PYEXE if exist "%%~fD\python.exe" (
  "%%~fD\python.exe" -I "%~dp0scripts\open-panel.py" --check-runtime >nul 2>nul
  if not errorlevel 1 set "PYEXE=%%~fD\python.exe"
)
if not defined PYEXE for /f "delims=" %%P in ('where python 2^>nul') do if not defined PYEXE (
  "%%P" -I "%~dp0scripts\open-panel.py" --check-runtime >nul 2>nul
  if not errorlevel 1 set "PYEXE=%%P"
)
if not defined PYEXE (
  echo [RALAT] Python bukan Microsoft Store tidak ditemui. Pasang Python dari python.org.
  pause
  exit /b 1
)
"%PYEXE%" -I "%~dp0scripts\open-panel.py"
if errorlevel 1 (
  echo.
  echo [RALAT] Pelancar tamat dengan ralat.
  pause
)
endlocal
