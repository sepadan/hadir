# Pasang HadirDesktop ke %LOCALAPPDATA%\HadirDesktop\, cipta pintasan Desktop,
# tanya autostart (default MATI), dan lancarkan exe sekali. Idempoten.

$ErrorActionPreference = "Stop"

$src        = Join-Path $PSScriptRoot "dist\win-x64\HadirDesktop.exe"
$installDir = Join-Path $env:LOCALAPPDATA "HadirDesktop"
$targetExe  = Join-Path $installDir "HadirDesktop.exe"

if (-not (Test-Path $src)) {
    Write-Error "Tidak jumpa $src — jalankan publish.ps1 dahulu."
    exit 1
}

# (a) Salin exe ke folder pemasangan (idempoten: -Force menulis semula).
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path $src -Destination $targetExe -Force
Write-Host "Salin: $targetExe"

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
