# Terbit HadirDesktop sebagai exe self-contained win-x64 (single-file).
# Keluar dengan kod bukan-sifar jika publish gagal.

$ErrorActionPreference = "Stop"

$csproj = Join-Path $PSScriptRoot "HadirDesktop\HadirDesktop.csproj"
$out    = Join-Path $PSScriptRoot "dist\win-x64"

if (-not (Test-Path $csproj)) {
    Write-Error "Tidak jumpa projek: $csproj"
    exit 1
}

Write-Host "Terbit HadirDesktop (self-contained win-x64) ..."

dotnet publish $csproj `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $out

if ($LASTEXITCODE -ne 0) {
    Write-Error "Publish gagal (kod keluar $LASTEXITCODE)."
    exit $LASTEXITCODE
}

Write-Host "Siap: $out\HadirDesktop.exe"
exit 0
