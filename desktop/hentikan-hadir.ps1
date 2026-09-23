# Fungsi kongsi untuk setup.ps1 dan update.ps1: kesan, hentikan dengan sopan,
# dan soal versi exe HadirDesktop yang terpasang.
#
# Ini fail sumber-titik (dot-source) sahaja — ia tidak melakukan apa-apa apabila
# dijalankan sendiri. Ia TIDAK PERNAH menyentuh fail data pengguna; satu-satunya
# fail yang disebut di sini ialah HadirDesktop.exe.

# Proses HadirDesktop yang berjalan DARI laluan exe yang diberi sahaja. Salinan
# lain (cth folder dev) tidak disentuh.
function Get-ProsesHadir {
    param([Parameter(Mandatory)][string] $ExePath)

    $senarai = @()
    foreach ($p in (Get-Process -Name "HadirDesktop" -ErrorAction SilentlyContinue)) {
        try {
            if ($p.Path -and ($p.Path -eq $ExePath)) { $senarai += $p }
        } catch {
            # Tiada kebenaran membaca laluan proses itu: bukan milik kita, langkau.
        }
    }
    return $senarai
}

# Bolehkah exe ditulis sekarang? Aplikasi yang hidup mengunci failnya, jadi ini
# ialah pagar sebenar sebelum menyalin (menyalin di atas exe terkunci = exe rosak).
function Test-ExeBolehTulis {
    param([Parameter(Mandatory)][string] $ExePath)

    if (-not (Test-Path $ExePath)) { return $true }
    try {
        $fs = [System.IO.File]::Open($ExePath, 'Open', 'Write', 'None')
        $fs.Close()
        return $true
    } catch {
        return $false
    }
}

# Tunggu sehingga exe boleh ditulis. Windows melepaskan kunci imej sedikit LEWAT
# daripada kematian proses — termasuk selepas `--versi` yang hidup sekejap — jadi
# setiap penyalinan mesti melalui pagar ini dahulu.
function Wait-ExeBolehTulis {
    param(
        [Parameter(Mandatory)][string] $ExePath,
        [int] $HadMasaSaat = 15
    )

    $tamat = (Get-Date).AddSeconds($HadMasaSaat)
    while ((Get-Date) -lt $tamat) {
        if (Test-ExeBolehTulis -ExePath $ExePath) { return $true }
        Start-Sleep -Milliseconds 250
    }
    return (Test-ExeBolehTulis -ExePath $ExePath)
}

# Hentikan aplikasi: tutup tetingkap utama dahulu (sopan), tunggu sehingga had
# masa, dan hanya selepas itu Stop-Process. Pulangkan $true jika aplikasi MEMANG
# berjalan sebelum ini (pemanggil guna ini untuk memutuskan sama ada perlu
# lancar semula).
function Stop-HadirDesktop {
    param(
        [Parameter(Mandatory)][string] $ExePath,
        [int] $HadMasaSaat = 20
    )

    $proses = @(Get-ProsesHadir -ExePath $ExePath)
    if ($proses.Count -eq 0) {
        Write-Host "Aplikasi tidak berjalan."
        return $false
    }

    Write-Host "Aplikasi sedang berjalan — meminta ia tutup dengan sopan ..."
    foreach ($p in $proses) {
        try { $null = $p.CloseMainWindow() } catch { }
    }

    $tamat = (Get-Date).AddSeconds($HadMasaSaat)
    while ((Get-Date) -lt $tamat) {
        if ((Get-ProsesHadir -ExePath $ExePath).Count -eq 0) { break }
        Start-Sleep -Milliseconds 500
    }

    $degil = @(Get-ProsesHadir -ExePath $ExePath)
    if ($degil.Count -gt 0) {
        Write-Host "Masih hidup selepas $HadMasaSaat s — menghentikan secara paksa."
        foreach ($p in $degil) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { }
        }
    }

    if (-not (Wait-ExeBolehTulis -ExePath $ExePath -HadMasaSaat 15)) {
        throw "Exe masih terkunci: $ExePath - tutup HadirDesktop secara manual dan cuba lagi."
    }

    Write-Host "Aplikasi dihentikan."
    return $true
}

# Soal versi exe: jalankan `HadirDesktop.exe --versi` dan tangkap stdout. Exe
# ialah aplikasi GUI, jadi stdout MESTI dialihkan ke fail sementara (dalam
# %TEMP%, bukan folder pemasangan) untuk ditangkap. Pulangkan $null jika gagal.
function Get-VersiExe {
    param([Parameter(Mandatory)][string] $ExePath)

    if (-not (Test-Path $ExePath)) { return $null }

    $tmp = Join-Path $env:TEMP ("hadir-versi-" + [Guid]::NewGuid().ToString("N") + ".txt")
    try {
        $p = Start-Process -FilePath $ExePath -ArgumentList "--versi" `
            -Wait -PassThru -NoNewWindow -RedirectStandardOutput $tmp
        if ($p.ExitCode -ne 0) { return $null }

        $teks = (Get-Content -Path $tmp -Raw -ErrorAction SilentlyContinue)
        if ([string]::IsNullOrWhiteSpace($teks)) { return $null }
        return $teks.Trim()
    } catch {
        return $null
    } finally {
        Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue
    }
}
