# Bina pakej pemasang HADIR Desktop untuk PC sekolah.
#
# Input : dist\win-x64\HadirDesktop.exe   (jalankan publish.ps1 dahulu)
# Output: dist\HadirDesktop-Pemasang-<versi>\      (folder pakej)
#         dist\HadirDesktop-Pemasang-<versi>.zip   (pakej untuk dihantar)
#         dist\HadirDesktop-Pemasang-<versi>.json  (manifest: versi + SHA256)
#
# Pakej TIDAK PERNAH mengandungi rahsia enjin, kata laluan, kredensial DPAPI
# atau fail `%LOCALAPPDATA%\HADIR-MOEIS-Companion\`. Ia mengandungi exe dan
# skrip sahaja; semua rahsia ditaip pada PC itu sendiri.

$ErrorActionPreference = "Stop"

$akar    = $PSScriptRoot
$desktop = Split-Path $akar -Parent          # folder desktop\
$src     = Join-Path $desktop "dist\win-x64\HadirDesktop.exe"

if (-not (Test-Path $src)) {
    Write-Error "Tidak jumpa $src - jalankan publish.ps1 dahulu."
    exit 1
}

# Versi daripada exe itu sendiri (SATU sumber kebenaran).
$versi = (& $src --versi 2>$null | Select-Object -First 1)
$versi = "$versi".Trim()
if (-not $versi -or $versi -notmatch '^\d+\.\d+\.\d+') {
    Write-Error "Versi exe tidak dapat dibaca (dapat '$versi')."
    exit 1
}

$nama    = "HadirDesktop-Pemasang-$versi"
$outDir  = Join-Path $desktop "dist\$nama"
$zipPath = Join-Path $desktop "dist\$nama.zip"
$jsonPath= Join-Path $desktop "dist\$nama.json"

if (Test-Path $outDir)  { Remove-Item $outDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Fail yang pergi ke PC sekolah. Senarai ini SENGAJA eksplisit: tiada apa yang
# ditambah secara tidak sengaja.
$fail = @(
    @{ Dari = $src;                                    Nama = "HadirDesktop.exe" },
    @{ Dari = (Join-Path $desktop "setup.ps1");         Nama = "setup.ps1" },
    @{ Dari = (Join-Path $desktop "update.ps1");        Nama = "update.ps1" },
    @{ Dari = (Join-Path $desktop "hentikan-hadir.ps1");Nama = "hentikan-hadir.ps1" },
    @{ Dari = (Join-Path $desktop "KEMASKINI.md");      Nama = "KEMASKINI.md" },
    @{ Dari = (Join-Path $akar "PASANG.cmd");           Nama = "PASANG.cmd" },
    @{ Dari = (Join-Path $akar "BACA-SAYA.md");         Nama = "BACA-SAYA.md" }
)

foreach ($f in $fail) {
    if (-not (Test-Path $f.Dari)) {
        Write-Error "Fail pakej hilang: $($f.Dari)"
        exit 1
    }
    Copy-Item -Path $f.Dari -Destination (Join-Path $outDir $f.Nama) -Force
    Write-Host "  + $($f.Nama)"
}

# Gagal-tertutup: pakej mesti TIDAK mengandungi apa-apa selain senarai di atas.
$dibenarkan = $fail | ForEach-Object { $_.Nama }
$lebihan = Get-ChildItem $outDir -File | Where-Object { $dibenarkan -notcontains $_.Name }
if ($lebihan) {
    Write-Error ("Pakej mengandungi fail yang tidak dijangka: " + (($lebihan.Name) -join ", "))
    exit 1
}

# Elak rahsia tersasar masuk pakej: cari nama fail sensitif yang diketahui.
$sensitif = Get-ChildItem $outDir -Recurse -File |
    Where-Object { $_.Name -match '\.(dat|json|key|pem)$' -or $_.Name -match 'rahsia|kredensial|password|token' }
if ($sensitif) {
    Write-Error ("Pakej mengandungi fail sensitif: " + (($sensitif.FullName) -join ", "))
    exit 1
}

Compress-Archive -Path (Join-Path $outDir "*") -DestinationPath $zipPath -Force

$hashExe = (Get-FileHash -Path $src -Algorithm SHA256).Hash
$hashZip = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash
$saiz    = (Get-Item $zipPath).Length
$masa    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# Manifest ringkas untuk rujukan manusia/log. Ia mengandungi HASH sahaja.
$manifest = [ordered]@{
    versi        = $versi
    exe          = "HadirDesktop.exe"
    exeSaizBait  = (Get-Item $src).Length
    exeSha256    = $hashExe
    zip          = (Split-Path $zipPath -Leaf)
    zipSaizBait  = $saiz
    zipSha256    = $hashZip
    dibinaUtc    = $masa
}
$manifest.GetEnumerator() | Out-Null
($manifest | ConvertTo-Json) | Set-Content -Path $jsonPath -Encoding UTF8

Write-Host ""
Write-Host "Pakej : $zipPath"
Write-Host "Manifest: $jsonPath"
Write-Host "Versi : $versi"
Write-Host "SHA256 exe: $hashExe"
Write-Host "SHA256 zip: $hashZip"
exit 0
