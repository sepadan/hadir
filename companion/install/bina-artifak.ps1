# bina-artifak.ps1 — hasilkan dist/hadir-moeis-companion-<versi>.zip.
#
# Zip mengandungi kod sumber + skrip pemasangan + dokumentasi. Ia TIDAK
# mengandungi data tempatan, log, profil pelayar, atau rahsia.
#
# playwright-core di-VENDOR ke dalam zip apabila boleh dijumpai (atau dipasang),
# supaya PC guru tidak perlu memuat turun apa-apa daripada npm. Jika tidak
# ditemui, zip masih sah dan pemasangan perlu `npm install --omit=dev`.
#
# Guna:
#   powershell -ExecutionPolicy Bypass -File install/bina-artifak.ps1
#   powershell ... -SumberPlaywrightCore "D:\pakej\node_modules\playwright-core"
param(
    [string[]]$SumberPlaywrightCore = @(
        (Join-Path $PSScriptRoot '..\node_modules\playwright-core'),
        (Join-Path $env:USERPROFILE 'work\moeis-bot\node_modules\playwright-core')
    ),
    [switch]$TanpaVendor
)
$ErrorActionPreference = 'Stop'
$sini = Split-Path -Parent $MyInvocation.MyCommand.Path
$akar = Split-Path -Parent $sini
$pkg = Get-Content (Join-Path $akar 'package.json') -Raw | ConvertFrom-Json
$versi = $pkg.version
$dist = Join-Path $akar 'dist'
$stagingNama = "hadir-moeis-companion-$versi"
$staging = Join-Path $dist $stagingNama
$zip = Join-Path $dist "$stagingNama.zip"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$abaikan = @('node_modules', 'dist', 'data', 'log', 'profil-pelayar', 'rahsia.dat', 'tetapan.json')
Get-ChildItem $akar -Force | Where-Object { $abaikan -notcontains $_.Name } | ForEach-Object {
    Copy-Item $_.FullName -Destination $staging -Recurse -Force
}

$vendorStatus = 'TIDAK di-vendor (pemasangan perlu npm install --omit=dev)'
if (-not $TanpaVendor) {
    $sumber = $SumberPlaywrightCore | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if ($sumber) {
        $sasaran = Join-Path $staging 'node_modules\playwright-core'
        New-Item -ItemType Directory -Path (Split-Path -Parent $sasaran) -Force | Out-Null
        Copy-Item $sumber $sasaran -Recurse -Force
        $vendorStatus = "di-vendor daripada $sumber"
    } else {
        Push-Location $staging
        try {
            npm install --omit=dev --no-audit --no-fund --ignore-scripts 2>&1 | Out-Null
            if (Test-Path (Join-Path $staging 'node_modules\playwright-core')) {
                $vendorStatus = 'di-vendor melalui npm install (perlu rangkaian semasa bina)'
            }
        } catch {
            Write-Warning "Vendor gagal: $($_.Exception.Message)"
        } finally { Pop-Location }
    }
}

# Nota pemasangan pantas di dalam zip.
$nota = @(
    "Companion HADIR-MOEIS v$versi",
    "",
    "1. Salin folder ini ke PC guru (cth C:\HADIR-MOEIS-Companion).",
    "2. Klik dua kali install\Jalankan-Companion.cmd",
    "   (jika playwright-core tidak di-vendor: jalankan 'npm install --omit=dev' sekali dalam folder ini).",
    "3. Buka pautan 'tetapan tempatan' yang dipaparkan, tampal rahsia enjin, jana kod pasangan.",
    "4. Di HADIR Admin -> Hantar ke MOEIS -> Sambung PC -> masukkan kod.",
    "",
    "Giliran MATI secara lalai. Autostart hanya jika anda hidupkan sendiri.",
    "Butiran penuh: docs\PEMASANGAN.md",
    "",
    "playwright-core: $vendorStatus"
) -join "`r`n"
Set-Content -Path (Join-Path $staging 'BACA-DULU.txt') -Value $nota -Encoding UTF8

Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -Force
$saiz = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Remove-Item $staging -Recurse -Force

Write-Host "Artifak dihasilkan: $zip ($saiz MB)" -ForegroundColor Green
Write-Host "playwright-core: $vendorStatus"
