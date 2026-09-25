@echo off
rem Pemasang HADIR Desktop untuk PC sekolah - klik dua kali sahaja.
rem Skrip ini TIDAK menyentuh rahsia: tiada URL, tiada kata laluan, tiada
rem kredensial disalin. Semuanya ditaip pada PC ini dalam Tetapan Tempatan.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
echo.
echo Tekan sebarang kekunci untuk tutup tetingkap ini.
pause >nul
endlocal
