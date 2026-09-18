@echo off
REM Jalankan-Companion.cmd — klik dua kali untuk mulakan companion HADIR-MOEIS.
REM Biarkan tetingkap ini terbuka semasa giliran berjalan.
cd /d "%~dp0\.."
node bin\hadir-companion.mjs serve
pause
