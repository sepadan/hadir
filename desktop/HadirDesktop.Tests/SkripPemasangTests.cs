using System;
using System.IO;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Content/path checks on the installer scripts. These are TEXT assertions (the
/// scripts do real publish/install work, so they are not executed here) — they
/// lock in the required flags, output path, install dir, shortcut, autostart
/// key (default OFF) and launch step so a regression cannot silently drop one.
/// </summary>
public class SkripPemasangTests
{
    private static string DesktopDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "publish.ps1")))
        {
            dir = dir.Parent;
        }
        return dir?.FullName ?? throw new InvalidOperationException("Tidak jumpa direktori desktop (publish.ps1).");
    }

    private static string BacaSkrip(string nama) => File.ReadAllText(Path.Combine(DesktopDir(), nama));

    // --- publish.ps1 ---

    [Fact]
    public void PublishPs1_GunaProjek_DanKeluaranYangBetul()
    {
        var s = BacaSkrip("publish.ps1");
        Assert.Contains(@"HadirDesktop\HadirDesktop.csproj", s);
        Assert.Contains(@"dist\win-x64", s);
    }

    [Fact]
    public void PublishPs1_MengandungiBenderaSelfContainedSingleFile()
    {
        var s = BacaSkrip("publish.ps1");
        Assert.Contains("--self-contained true", s);
        Assert.Contains("-p:PublishSingleFile=true", s);
        Assert.Contains("-p:IncludeNativeLibrariesForSelfExtract=true", s);
        Assert.Contains("-r win-x64", s);
        Assert.Contains("-c Release", s);
    }

    [Fact]
    public void PublishPs1_KeluarBukanSifar_BilaGagal()
    {
        var s = BacaSkrip("publish.ps1");
        Assert.Contains("$LASTEXITCODE", s);
        Assert.Contains("exit $LASTEXITCODE", s);
    }

    [Fact]
    public void PublishBat_MemanggilPs1()
    {
        var s = BacaSkrip("publish.bat");
        Assert.Contains("publish.ps1", s);
    }

    // --- setup.ps1 ---

    [Fact]
    public void SetupPs1_SalinKeLocalAppDataHadirDesktop()
    {
        var s = BacaSkrip("setup.ps1");
        Assert.Contains("LOCALAPPDATA", s);
        Assert.Contains("HadirDesktop", s);
        Assert.Contains("Copy-Item", s);
    }

    [Fact]
    public void SetupPs1_CiptaPintasanDesktop()
    {
        var s = BacaSkrip("setup.ps1");
        Assert.Contains("WScript.Shell", s);
        Assert.Contains("CreateShortcut", s);
        Assert.Contains(".lnk", s);
        Assert.Contains("GetFolderPath(\"Desktop\")", s);
    }

    [Fact]
    public void SetupPs1_Autostart_DefaultMati_KunciRun()
    {
        var s = BacaSkrip("setup.ps1");
        Assert.Contains(@"HKCU:\Software\Microsoft\Windows\CurrentVersion\Run", s);
        Assert.Contains("HadirDesktop", s);
        Assert.Contains("default mati", s);
    }

    [Fact]
    public void SetupPs1_LancarkanExeSekali()
    {
        var s = BacaSkrip("setup.ps1");
        Assert.Contains("Start-Process", s);
    }

    [Fact]
    public void SetupPs1_TiadaRahsia_DanSemakSumberDahulu()
    {
        var s = BacaSkrip("setup.ps1");
        Assert.DoesNotContain("rahsia.dat", s);
        Assert.DoesNotContain("kredensial.dat", s);
        Assert.Contains("publish.ps1", s); // fails fast if dist exe is missing
    }

    [Fact]
    public void SetupBat_MemanggilPs1()
    {
        var s = BacaSkrip("setup.bat");
        Assert.Contains("setup.ps1", s);
    }

    [Fact]
    public void GitIgnore_MenyenaraikanDist()
    {
        var s = BacaSkrip(".gitignore");
        Assert.Contains("dist/", s);
    }
}
