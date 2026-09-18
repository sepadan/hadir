# install-companion.ps1 — pemasangan mudah alih companion HADIR-MOEIS.
# Guna: powershell -ExecutionPolicy Bypass -File install-companion.ps1
# Tidak memuat turun Chromium (playwright-core sahaja, guna Edge sistem).
$ErrorActionPreference = 'Stop'
$sini = Split-Path -Parent $MyInvocation.MyCommand.Path
$akar = Split-Path -Parent $sini

Write-Host 'Companion HADIR-MOEIS — pemasangan mudah alih' -ForegroundColor Cyan

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error 'Node.js >= 20 diperlukan tetapi tidak ditemui pada PATH. Pasang daripada https://nodejs.org/ dahulu.'
    exit 1
}

$edge = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
    Write-Warning 'Microsoft Edge tidak ditemui pada lokasi biasa. MOEIS menolak pelayar headless dan companion memerlukan Edge sistem (channel msedge).'
}

Push-Location $akar
try {
    Write-Host 'Memasang pergantungan (playwright-core sahaja, tiada muat turun Chromium)...'
    npm install --omit=dev
} finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Pemasangan selesai. Jalankan:' -ForegroundColor Green
Write-Host "  node `"$akar\bin\hadir-companion.mjs`" serve"
Write-Host 'atau guna install/Jalankan-Companion.cmd'
