# Tulis manifest kemas kini untuk HADIR Desktop (desktop/kemas-kini/latest.json).
#
# HADIR Desktop membaca manifest ini daripada GitHub Pages dan menawarkan
# kemas kini apabila versinya lebih baharu. Fail exe dimuat turun daripada
# GitHub Releases pada tag desktop-v<versi>.
#
# Jalankan SELEPAS publish.ps1 (dan selepas exe diuji), kemudian commit
# manifest itu dan muat naik aset keluaran.
#
# PENTING: fail ini SENGAJA ASCII sahaja. PowerShell 5.1 membaca .ps1 tanpa BOM
# sebagai ANSI, jadi aksara bukan-ASCII (em dash, anak panah) merosakkan rentetan
# dan skrip gagal dihurai.
param(
    # Tag keluaran. Lalai: desktop-v<versi exe>.
    [string] $Tag = "",
    # Repo GitHub yang menyimpan aset.
    [string] $Repo = "sepadan/hadir",
    # Jangan tulis fail; cetak sahaja.
    [switch] $CubaSahaja
)

$ErrorActionPreference = "Stop"

$akar      = Split-Path -Parent $PSScriptRoot
$exe       = Join-Path $akar "dist\win-x64\HadirDesktop.exe"
$folderMan = Join-Path $akar "kemas-kini"
$failMan   = Join-Path $folderMan "latest.json"

if (-not (Test-Path $exe)) {
    Write-Error "Tidak jumpa $exe - jalankan publish.ps1 dahulu."
    exit 1
}

# Versi dibaca daripada exe itu sendiri: satu sumber kebenaran (csproj).
$versi = (& $exe --versi | Select-Object -First 1).Trim()
if (-not $versi) {
    Write-Error "Tidak dapat membaca versi daripada exe (--versi gagal)."
    exit 1
}
if ($versi -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "Versi '$versi' bukan bentuk major.minor.patch."
    exit 1
}
if (-not $Tag) { $Tag = "desktop-v$versi" }

$cincang = (Get-FileHash -Path $exe -Algorithm SHA256).Hash
$saiz    = (Get-Item $exe).Length

$url = "https://github.com/$Repo/releases/download/$Tag/HadirDesktop.exe"

$objek = [ordered]@{
    versi    = $versi
    url      = $url
    sha256   = $cincang
    saizBait = $saiz
}
$json = ($objek | ConvertTo-Json -Compress)

Write-Host "Versi    : $versi"
Write-Host "Cincang  : $cincang"
Write-Host "Saiz     : $saiz bait"
Write-Host "URL      : $url"

if ($CubaSahaja) {
    Write-Host "(cuba sahaja - tiada fail ditulis)"
    Write-Host $json
    exit 0
}

New-Item -ItemType Directory -Force -Path $folderMan | Out-Null
# UTF-8 TANPA BOM: BOM di hadapan menjadikan JSON tidak sah untuk pembaca
# (System.Text.Json menolaknya), jadi manifest mesti ditulis tanpa BOM.
[System.IO.File]::WriteAllText($failMan, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Manifest : $failMan"

Write-Host ""
Write-Host "Langkah seterusnya untuk keluaran ini:"
Write-Host "  1. Salin exe ke nama aset yang stabil:"
Write-Host "       Copy-Item '$exe' '$akar\dist\HadirDesktop.exe' -Force"
Write-Host "  2. Cipta aset keluaran pada tag $Tag (perlu 'gh auth login' sekali):"
Write-Host "       gh release create $Tag '$akar\dist\HadirDesktop.exe' --title 'HADIR Desktop $versi' --notes 'HADIR Desktop $versi'"
Write-Host "  3. Commit manifest (GitHub Pages akan menyajikannya):"
Write-Host "       git add desktop/kemas-kini/latest.json"
Write-Host "       git commit -m 'chore(desktop): kemas kini $versi'"
Write-Host "       git push origin HEAD:main"
exit 0
