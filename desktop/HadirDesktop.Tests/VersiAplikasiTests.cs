using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Versi ialah SATU sumber kebenaran (csproj → assembly → <see cref="VersiAplikasi"/>).
/// Ujian di sini mengunci bacaan itu, pembersihan akhiran <c>+hash</c>, dan
/// bendera <c>--versi</c> — termasuk satu larian sebenar exe supaya skrip
/// kemas kini tidak boleh kehilangan cara membaca versi yang terpasang.
/// </summary>
public class VersiAplikasiTests
{
    /// <summary>Corak versi yang diterima: 1.0.0 atau 1.0.0.0.</summary>
    private const string CorakVersi = @"^\d+\.\d+(\.\d+){1,2}$";

    [Fact]
    public void Versi_BukanKosong_DanIkutCorak()
    {
        Assert.False(string.IsNullOrWhiteSpace(VersiAplikasi.Versi));
        Assert.Matches(CorakVersi, VersiAplikasi.Versi);
    }

    [Fact]
    public void Versi_DibacaDaripadaAssembly_BukanNilaiTetapDalamKod()
    {
        var assembly = typeof(VersiAplikasi).Assembly;
        var info = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;

        Assert.False(string.IsNullOrWhiteSpace(info));
        Assert.Equal(VersiAplikasi.Bersihkan(info), VersiAplikasi.Versi);
    }

    [Theory]
    [InlineData("1.2.3+abc123", "1.2.3")]
    [InlineData("  1.2.3  ", "1.2.3")]
    [InlineData("1.2.3", "1.2.3")]
    [InlineData(null, "")]
    [InlineData("   ", "")]
    public void Bersihkan_BuangHashDanRuang(string? mentah, string dijangka)
    {
        Assert.Equal(dijangka, VersiAplikasi.Bersihkan(mentah));
    }

    [Fact]
    public void DariAssembly_JatuhBalikKeAssemblyVersion_BilaTiadaInformational()
    {
        // Assembly yang tiada AssemblyInformationalVersionAttribute: bacaan
        // mesti tetap memulangkan sesuatu yang sepadan dengan corak versi.
        var assembly = typeof(object).Assembly;
        var versi = VersiAplikasi.DariAssembly(assembly);

        Assert.False(string.IsNullOrWhiteSpace(versi));
        Assert.Matches(CorakVersi, versi);
    }

    [Theory]
    [InlineData(new[] { "--versi" }, true)]
    [InlineData(new[] { "--VERSI" }, true)]
    [InlineData(new[] { " --versi " }, true)]
    [InlineData(new[] { "--lain", "--versi" }, true)]
    [InlineData(new[] { "--version" }, false)]
    [InlineData(new string[0], false)]
    public void DimintaDariArgumen_KenalBenderaSahaja(string[] args, bool dijangka)
    {
        Assert.Equal(dijangka, VersiAplikasi.DimintaDariArgumen(args));
    }

    [Fact]
    public void DimintaDariArgumen_NullSelamat()
    {
        Assert.False(VersiAplikasi.DimintaDariArgumen(null));
    }

    [Fact]
    public void BarisLog_SatuBaris_MasaDanVersiSahaja()
    {
        var baris = VersiAplikasi.BarisLog(
            new DateTimeOffset(2026, 1, 2, 3, 4, 5, TimeSpan.Zero), "1.0.0");

        Assert.DoesNotContain("\n", baris);
        Assert.Contains("2026-01-02T03:04:05", baris);
        Assert.Contains("versi=1.0.0", baris);
    }

    [Fact]
    public void LaluanLog_DalamFolderHadirDesktop()
    {
        var laluan = VersiAplikasi.LaluanLog(Path.GetTempPath());

        Assert.Equal(VersiAplikasi.NamaFailLog, Path.GetFileName(laluan));
        Assert.Equal(DevAutoKitaran.NamaFolder, Path.GetFileName(Path.GetDirectoryName(laluan)!));
    }

    [Fact]
    public void BenderaVersi_ExeSebenar_CetakVersiDanKeluarSifar()
    {
        var exe = Path.Combine(AppContext.BaseDirectory, "HadirDesktop.exe");
        Assert.True(File.Exists(exe), $"Tidak jumpa exe untuk diuji: {exe}");

        var psi = new ProcessStartInfo(exe, VersiAplikasi.BenderaCli)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = AppContext.BaseDirectory,
        };

        using var proses = Process.Start(psi)!;
        var keluaran = proses.StandardOutput.ReadToEnd();

        // Had masa: bendera ini TIDAK boleh membuka tetingkap atau WebView2, jadi
        // proses mesti mati serta-merta. Menunggu selamanya akan menggantung ujian.
        if (!proses.WaitForExit(30_000))
        {
            try { proses.Kill(entireProcessTree: true); } catch { }
            Assert.Fail("`--versi` tidak keluar dalam 30 s — ia membuka tetingkap?");
        }

        Assert.Equal(0, proses.ExitCode);

        var versi = keluaran.Trim();
        Assert.False(string.IsNullOrWhiteSpace(versi));
        Assert.Matches(CorakVersi, versi);
        Assert.Equal(VersiAplikasi.Versi, versi);
    }

    [Fact]
    public void TajukTetingkap_MengandungiVersi()
    {
        var tajuk = DemoLabel.TajukTetingkapDenganVersi();

        Assert.StartsWith(DemoLabel.NamaApl + " " + VersiAplikasi.Versi, tajuk);
        Assert.Contains(DemoLabel.SufiksDemo.Trim(), tajuk);
    }

    /// <summary>
    /// Label mesti jujur: dengan ciri sebenar dihidupkan (pemasangan sekolah),
    /// aplikasi TIDAK boleh mengaku dirinya "MOD DEMO" — ia memang menulis ke
    /// MOEIS. Versi mesti kekal kelihatan dalam kedua-dua mod.
    /// </summary>
    [Fact]
    public void LabelMod_CiriSebenar_TiadaKataDemo()
    {
        var produksi = DemoLabel.TajukTetingkapDenganVersi(adaCiriSebenar: true);

        Assert.DoesNotContain("DEMO", produksi);
        Assert.Contains(VersiAplikasi.Versi, produksi);
        Assert.Equal(DemoLabel.NamaApl + " " + VersiAplikasi.Versi, produksi);

        // Tanpa ciri sebenar, penanda demo KEKAL (tidak pernah mengaku produksi).
        Assert.Contains(DemoLabel.SufiksDemo.Trim(), DemoLabel.TajukTetingkapDenganVersi(adaCiriSebenar: false));

        Assert.Equal(DemoLabel.BannerProduksi, DemoLabel.Banner(adaCiriSebenar: true));
        Assert.Equal(DemoLabel.BannerText, DemoLabel.Banner(adaCiriSebenar: false));
        Assert.DoesNotContain("Tiada tulisan MOEIS", DemoLabel.BannerProduksi);
    }

    [Fact]
    public void NotaDulang_MengandungiVersi_DanKekalDalamHad()
    {
        foreach (KeadaanPortal keadaan in Enum.GetValues<KeadaanPortal>())
        {
            var nota = LabelKeadaanPortal.UntukDulang(keadaan, VersiAplikasi.Versi);

            Assert.Contains(VersiAplikasi.Versi, nota);
            Assert.True(nota.Length <= LabelKeadaanPortal.MaksNotaDulang,
                $"{keadaan}: nota dulang {nota.Length} aksara melebihi had {LabelKeadaanPortal.MaksNotaDulang}");
        }
    }

    [Fact]
    public void NotaDulang_TanpaVersi_KekalSepertiDahulu()
    {
        Assert.Equal("HADIR Desktop — diam", LabelKeadaanPortal.UntukDulang(KeadaanPortal.Diam));
    }
}
