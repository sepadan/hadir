# Kemas kini HadirDesktop yang terpasang di %LOCALAPPDATA%\HadirDesktop\.
#
# Skrip ini MENULIS SATU FAIL SAHAJA: HadirDesktop.exe (dan sandarannya,
# HadirDesktop.exe.bak-<versi>). Semua fail data pengguna dalam folder itu
# (idme-login.json, id-pemilik.json, penolakan-kredensial.json,
# real-portal-evidence\, *.log, webview2-*) dan SELURUH folder
# %LOCALAPPDATA%\HADIR-MOEIS-Companion\ tidak disentuh langsung.
#
# Idempoten: jalankan semula dengan dist yang sama = exe sama, cuma dilaporkan
# "tidak berubah". Lihat KEMASKINI.md untuk langkah penuh + rollback.

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "hentikan-hadir.ps1")

$src        = Join-Path $PSScriptRoot "dist\win-x64\HadirDesktop.exe"
$installDir = Join-Path $env:LOCALAPPDATA "HadirDesktop"
$targetExe  = Join-Path $installDir "HadirDesktop.exe"

if (-not (Test-Path $src)) {
    Write-Error "Tidak jumpa $src — jalankan publish.ps1 dahulu."
    exit 1
}

if (-not (Test-Path $targetExe)) {
    Write-Error "Tidak jumpa pemasangan di $targetExe — jalankan setup.ps1 dahulu (pemasangan baharu)."
    exit 1
}

# (a)+(b) Kesan dan hentikan aplikasi yang sedang berjalan. $sedangBerjalan
#         menentukan sama ada kita lancar semula di hujung.
$sedangBerjalan = Stop-HadirDesktop -ExePath $targetExe -HadMasaSaat 20

# (c) Versi SEBELUM — dibaca daripada exe yang terpasang, selepas ia berhenti.
$versiSebelum = Get-VersiExe -ExePath $targetExe
if (-not $versiSebelum) {
    $versiSebelum = "tidak-diketahui"
    Write-Host "Amaran: versi exe terpasang tidak dapat dibaca (binaan lama tanpa --versi?)."
}
Write-Host "Versi terpasang sekarang: $versiSebelum"

# Membaca versi menjalankan exe itu sendiri, dan Windows melepaskan kunci imej
# sedikit LEWAT daripada kematian proses. Tanpa pagar ini, salinan di bawah
# boleh gagal (atau separuh tulis) walaupun tiada aplikasi benar-benar hidup.
if (-not (Wait-ExeBolehTulis -ExePath $targetExe -HadMasaSaat 15)) {
    Write-Error "Exe masih terkunci: $targetExe - tutup HadirDesktop dan cuba lagi. Tiada fail diubah."
    exit 3
}

# (d) Sandarkan exe lama. Satu sandaran bagi satu versi — sandaran dengan nama
#     sama DIGANTI supaya fail .bak tidak bertimbun.
$backupExe = "$targetExe.bak-$versiSebelum"
Copy-Item -Path $targetExe -Destination $backupExe -Force
Write-Host "Sandaran: $backupExe"

# (e) Salin binaan baharu ke atas exe terpasang.
Copy-Item -Path $src -Destination $targetExe -Force
Write-Host "Salin: $src -> $targetExe"

# (f) Sahkan salinan dengan SHA256. Tidak sama = salinan separuh/rosak: pulihkan
#     sandaran dan keluar bukan-sifar.
$hashSumber = (Get-FileHash -Path $src -Algorithm SHA256).Hash
$hashTarget = (Get-FileHash -Path $targetExe -Algorithm SHA256).Hash

if ($hashSumber -ne $hashTarget) {
    Write-Host "SHA256 sumber : $hashSumber"
    Write-Host "SHA256 target : $hashTarget"
    Copy-Item -Path $backupExe -Destination $targetExe -Force
    Write-Error "Salinan GAGAL disahkan (SHA256 tidak sepadan). Exe lama telah dipulihkan daripada $backupExe. Tiada fail data disentuh."
    exit 2
}
Write-Host "Sah: SHA256 sepadan ($hashSumber)."

# (g) Versi SELEPAS + laporan sebelum -> selepas.
$versiSelepas = Get-VersiExe -ExePath $targetExe
if (-not $versiSelepas) { $versiSelepas = "tidak-diketahui" }

Write-Host ""
Write-Host "Versi: $versiSebelum -> $versiSelepas"
if ($versiSebelum -eq $versiSelepas) {
    Write-Host "PERHATIAN: nombor versi TIDAK berubah — binaan ini sama seperti sebelumnya."
    Write-Host "Jika anda menjangka binaan baharu: tarik kod terkini, naikkan <Version> dalam HadirDesktop.csproj, dan jalankan publish.ps1 semula."
}
Write-Host ""

# (h) Lancar semula HANYA jika aplikasi memang berjalan sebelum kemas kini.
if ($sedangBerjalan) {
    Write-Host "Melancarkan semula HadirDesktop ..."
    Start-Process -FilePath $targetExe -WorkingDirectory $installDir
} else {
    Write-Host "Aplikasi tidak berjalan sebelum ini — tidak dilancarkan."
}

Write-Host "Kemas kini siap. Data pengguna tidak disentuh."
Write-Host "Rollback: salin `"$backupExe`" semula ke `"$targetExe`" (lihat KEMASKINI.md)."
exit 0
