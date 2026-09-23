using System;
using System.IO;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Alat PEMBANGUN <c>HADIR_DEV_AUTO_KITARAN</c>: keputusan gating TULEN (tiada
/// WinForms, tiada env proses) dan penulisan log ke laluan SEMENTARA sahaja.
///
/// Yang paling penting di sini ialah arah GAGAL: apa-apa yang bukan truthy
/// mesti MATI, kerana MATI bermakna pengeluaran tidak berubah langsung.
/// </summary>
public class DevAutoKitaranTests
{
    // ---------- gating tulen ----------

    [Theory]
    [InlineData("1")]
    [InlineData("true")]
    [InlineData("TRUE")]
    [InlineData("True")]
    [InlineData("ya")]
    [InlineData("YA")]
    [InlineData("yes")]
    [InlineData("on")]
    [InlineData("  1  ")]
    [InlineData(" ya ")]
    public void NilaiTruthy_Hidup(string nilai) =>
        Assert.True(DevAutoKitaran.PatutAutoKitaran(nilai));

    [Theory]
    [InlineData(null)]          // tidak ditetapkan
    [InlineData("")]            // kosong
    [InlineData("   ")]         // ruang sahaja
    [InlineData("0")]
    [InlineData("false")]
    [InlineData("tidak")]
    [InlineData("no")]
    [InlineData("off")]
    [InlineData("11")]
    [InlineData("truthy")]
    [InlineData("1 ya")]
    public void NilaiLain_Mati(string? nilai) =>
        Assert.False(DevAutoKitaran.PatutAutoKitaran(nilai));

    [Fact]
    public void Mati_TiadaLaluanLog()
    {
        var mod = DevAutoKitaran.Cipta(false, Path.GetTempPath());

        Assert.False(mod.Dihidupkan);
        Assert.Null(mod.LaluanLog);
    }

    [Fact]
    public void Hidup_LaluanLogDalamFolderAplikasi()
    {
        var asas = Path.Combine(Path.GetTempPath(), "hadir-dev-kitaran-" + Guid.NewGuid().ToString("N"));
        var mod = DevAutoKitaran.Cipta(true, asas);

        Assert.True(mod.Dihidupkan);
        Assert.Equal(
            Path.Combine(asas, DevAutoKitaran.NamaFolder, DevAutoKitaran.NamaFailLog),
            mod.LaluanLog);
    }

    [Fact]
    public void Mati_TulisTidakMenciptaFail()
    {
        var asas = Path.Combine(Path.GetTempPath(), "hadir-dev-kitaran-" + Guid.NewGuid().ToString("N"));
        var mod = DevAutoKitaran.Cipta(false, asas);

        mod.Tulis("apa-apa");

        Assert.False(Directory.Exists(asas));
    }

    // ---------- penulisan log ----------

    [Fact]
    public void Tulis_MenciptaFolderDanMenambahBaris()
    {
        var asas = Path.Combine(Path.GetTempPath(), "hadir-dev-kitaran-" + Guid.NewGuid().ToString("N"));
        try
        {
            var mod = DevAutoKitaran.Cipta(true, asas);

            mod.Tulis("baris-pertama");
            mod.Tulis("baris-kedua");

            var baris = File.ReadAllLines(mod.LaluanLog!);
            Assert.Equal(new[] { "baris-pertama", "baris-kedua" }, baris);
        }
        finally
        {
            if (Directory.Exists(asas)) Directory.Delete(asas, recursive: true);
        }
    }

    [Fact]
    public void TulisKe_LaluanTidakSah_TidakMelontar()
    {
        // Gagal-tertutup: log pembangun tidak boleh menjatuhkan aplikasi.
        DevAutoKitaran.TulisKe("Z:\\tiada-pemacu\\dev-kitaran.log", "baris");
        DevAutoKitaran.TulisKe(Path.Combine(Path.GetTempPath(), "fail|tidak*sah.log"), "baris");
        DevAutoKitaran.TulisKe(null, "baris");
        DevAutoKitaran.TulisKe("   ", "baris");
    }

    [Fact]
    public void TulisKe_LaluanIalahFolderSediaAda_TidakMelontar()
    {
        var folder = Path.Combine(Path.GetTempPath(), "hadir-dev-kitaran-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try
        {
            DevAutoKitaran.TulisKe(folder, "baris");
        }
        finally
        {
            Directory.Delete(folder, recursive: true);
        }
    }

    // ---------- bentuk baris ----------

    [Fact]
    public void BarisKitaran_MembawaMasaIsoKeadaanSebabDanPenghantaran()
    {
        var masa = new DateTimeOffset(2026, 9, 23, 8, 5, 4, TimeSpan.FromHours(8));

        var baris = DevAutoKitaran.BarisKitaran(masa, "Ada kerja", "Satu tugasan menunggu.", "1 tugasan dihantar.");

        Assert.StartsWith("2026-09-23T08:05:04+08:00", baris);
        Assert.Contains("keadaan=Ada kerja", baris);
        Assert.Contains("sebab=Satu tugasan menunggu.", baris);
        Assert.Contains("penghantaran=1 tugasan dihantar.", baris);
    }

    [Fact]
    public void BarisKitaran_MedanKosongMenjadiSempang()
    {
        var baris = DevAutoKitaran.BarisKitaran(DateTimeOffset.Now, null, "", "   ");

        Assert.Contains("keadaan=-", baris);
        Assert.Contains("sebab=-", baris);
        Assert.Contains("penghantaran=-", baris);
    }

    [Fact]
    public void BarisKitaran_SatuKitaranSatuBaris()
    {
        var baris = DevAutoKitaran.BarisKitaran(
            DateTimeOffset.Now, "Ada kerja", "sebab\r\nbaris kedua", "hantar\nlagi");

        Assert.DoesNotContain("\n", baris);
        Assert.DoesNotContain("\r", baris);
    }

    [Fact]
    public void BarisLangkah_MembawaMasaIsoDanMesej()
    {
        var masa = new DateTimeOffset(2026, 9, 23, 8, 5, 4, TimeSpan.FromHours(8));

        var baris = DevAutoKitaran.BarisLangkah(masa, "KLAIM_OK: id=job-1");

        Assert.Equal("2026-09-23T08:05:04+08:00 langkah=KLAIM_OK: id=job-1", baris);
    }
}
