# Pasang HadirDesktop ke %LOCALAPPDATA%\HadirDesktop\, cipta pintasan Desktop,
# tanya autostart (default MATI), dan lancarkan exe sekali. Idempoten.

$ErrorActionPreference = "Stop"

# Logik henti-aplikasi + soal-versi yang SAMA seperti update.ps1 (fail kongsi,
# supaya kedua-dua skrip tidak boleh terpesong antara satu sama lain).
. (Join-Path $PSScriptRoot "hentikan-hadir.ps1")

$src        = Join-Path $PSScriptRoot "dist\win-x64\HadirDesktop.exe"
$installDir = Join-Path $env:LOCALAPPDATA "HadirDesktop"
$targetExe  = Join-Path $installDir "HadirDesktop.exe"

if (-not (Test-Path $src)) {
    Write-Error "Tidak jumpa $src — jalankan publish.ps1 dahulu."
    exit 1
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

# (a0) Aplikasi yang hidup mengunci exe-nya: hentikan dahulu, jika tidak salinan
#      di bawah gagal atau menghasilkan exe separuh tulis. Tiada fail data
#      disentuh oleh langkah ini.
$null = Stop-HadirDesktop -ExePath $targetExe -HadMasaSaat 20

# (a) Salin exe ke folder pemasangan (idempoten: -Force menulis semula).
Copy-Item -Path $src -Destination $targetExe -Force
Write-Host "Salin: $targetExe"

# (a0b) Salin juga skrip kemas kini ke folder pemasangan. HADIR Desktop
#       memanggil update.ps1 DARI SINI apabila pemilik menekan
#       "Muat turun & pasang" pada kemas kini yang ditemui — jadi laluan itu
#       tidak bergantung pada folder repo yang mungkin tiada di PC sekolah.
foreach ($namaSkrip in @("update.ps1", "hentikan-hadir.ps1")) {
    $dari = Join-Path $PSScriptRoot $namaSkrip
    if (Test-Path $dari) {
        Copy-Item -Path $dari -Destination (Join-Path $installDir $namaSkrip) -Force
        Write-Host "Salin skrip: $namaSkrip"
    } else {
        Write-Host "Amaran: $namaSkrip tiada dalam pakej - kemas kini dalam aplikasi tidak akan berfungsi."
    }
}

# (a1) Sahkan binaan mana yang baru dipasang.
$versi = Get-VersiExe -ExePath $targetExe
if ($versi) {
    Write-Host "Versi dipasang: $versi"
} else {
    Write-Host "Amaran: versi exe tidak dapat dibaca (`--versi` gagal)."
}

# (b) Pintasan Desktop (idempoten: dicipta semula setiap kali).
$desktop     = [Environment]::GetFolderPath("Desktop")
$shortcut    = Join-Path $desktop "HadirDesktop.lnk"
$wsh         = New-Object -ComObject WScript.Shell
$lnk         = $wsh.CreateShortcut($shortcut)
$lnk.TargetPath       = $targetExe
$lnk.WorkingDirectory = $installDir
$lnk.Save()
Write-Host "Pintasan: $shortcut"

# (c) Autostart: tanya hanya jika belum didaftar (idempoten). Default MATI.
$runKey  = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runName = "HadirDesktop"
$sedia   = (Get-ItemProperty -Path $runKey -Name $runName -ErrorAction SilentlyContinue).$runName

if ($sedia) {
    Write-Host "Autostart sudah didaftar: $sedia"
} else {
    $jawapan = Read-Host "Daftar untuk mula bersama Windows? (y/n)"
    if ($jawapan -match '^[yY]') {
        Set-ItemProperty -Path $runKey -Name $runName -Value "`"$targetExe`""
        Write-Host "Autostart didaftar."
    } else {
        Write-Host "Autostart TIDAK didaftar (default mati)."
    }
}

# (d) Lancarkan exe sekali (pelancaran kedua hanya memberi isyarat; aplikasi
#     ialah satu-tika, jadi idempoten).
Write-Host "Melancarkan HadirDesktop ..."
Start-Process -FilePath $targetExe -WorkingDirectory $installDir

Write-Host "Pemasangan siap."
exit 0
