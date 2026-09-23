using System;
using System.IO;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Kitaran automatik produksi ialah ciri yang MENULIS ke MOEIS, jadi syaratnya
/// mesti jelas dan terkunci: ia hanya berdenyut apabila pemilik opt-in. Ujian ini
/// menjaga keputusan itu, selang yang munasabah, dan laluan log.
/// </summary>
public class KitaranAutoTests
{
    [Theory]
    [InlineData(false, false, false)]
    [InlineData(true, false, true)]
    [InlineData(false, true, true)]
    [InlineData(true, true, true)]
    public void KenaJalan_HanyaApabilaPemilikOptIn(bool loginAuto, bool hantarAuto, bool dijangka)
    {
        Assert.Equal(dijangka, KitaranAuto.KenaJalan(loginAuto, hantarAuto));
    }

    /// <summary>
    /// Kedua-duanya MATI mesti bermakna TIADA denyutan. Jika ujian ini gagal,
    /// aplikasi akan melakukan aktiviti portal tanpa kebenaran pemilik.
    /// </summary>
    [Fact]
    public void KeduaDuaMati_TiadaKitaran()
    {
        Assert.False(KitaranAuto.KenaJalan(loginAuto: false, hantarAuto: false));
    }

    [Fact]
    public void Selang_Munasabah_TidakTerlaluPantasAtauLambat()
    {
        Assert.InRange(KitaranAuto.SelangMinit, 1, 60);
        Assert.InRange(KitaranAuto.TundaanMulaSaat, 0, 300);
    }

    [Fact]
    public void LaluanLog_DiBawahFolderAsasYangDiberi()
    {
        var asas = Path.Combine(Path.GetTempPath(), "hadir-ujian-kitaran");

        var laluan = KitaranAuto.LaluanLog(asas);

        Assert.Equal(Path.Combine(asas, KitaranAuto.NamaFolder, KitaranAuto.NamaFailLog), laluan);
        // Membina laluan TIDAK boleh menyentuh cakera.
        Assert.False(File.Exists(laluan));
        Assert.False(Directory.Exists(Path.Combine(asas, KitaranAuto.NamaFolder)));
    }

    [Fact]
    public void NamaFailLog_SamaSepertiBarisVersiSetiapLancaran()
    {
        // Baris versi setiap lancaran menulis ke fail yang SAMA; jika ia berpisah,
        // penyelenggaraan kehilangan jejak kitaran dalam log.
        Assert.Equal("hadir-desktop.log", KitaranAuto.NamaFailLog);
    }
}
