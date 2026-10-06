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

    // ---------- kitaran pintar (1.0.15) ----------

    [Fact]
    public void SelangCepat_90Saat_LebihPantasDaripadaSelangBiasa()
    {
        Assert.Equal(90, KitaranAuto.SelangCepatSaat);
        Assert.Equal(KitaranAuto.SelangMinit * 60, KitaranAuto.SelangBiasaSaat);
        Assert.True(KitaranAuto.SelangCepatSaat < KitaranAuto.SelangBiasaSaat);
    }

    /// <summary>
    /// Pass penghantaran terakhir MENUNJUKKAN kerja mungkin belum siap: kitaran
    /// seterusnya dalam 90 saat, bukan 10 minit (bukti log: kegagalan
    /// <c>halaman-tidak-sedia</c> hanya dibaiki 10 minit kemudian).
    /// </summary>
    [Theory]
    [InlineData(AliranPenghantaranMoeis.StatusGagal)]
    [InlineData(AliranPenghantaranMoeis.StatusBackendSementara)]
    [InlineData(AliranPenghantaranMoeis.StatusLaporanGagal)]
    [InlineData(AliranPenghantaranMoeis.StatusEnjinLuarTalian)]
    [InlineData(AliranPenghantaranMoeis.StatusTiadaPemilik)]
    public void SelangSaat_KerjaMungkinBelumSiap_Pantas(string status)
    {
        Assert.Equal(KitaranAuto.SelangCepatSaat, KitaranAuto.SelangSaat(status, bilGagal: 0, bilBelumSiap: 0));
        Assert.Equal(KitaranAuto.SelangCepatSaat, KitaranAuto.SelangSaat(status, bilGagal: 2, bilBelumSiap: 1));
    }

    [Theory]
    [InlineData(AliranPenghantaranMoeis.StatusTiadaPenghantaran)]
    [InlineData(AliranPenghantaranMoeis.StatusDihantar)]
    public void SelangSaat_TiadaKerjaTertinggal_Perlahan(string status)
    {
        Assert.Equal(KitaranAuto.SelangBiasaSaat, KitaranAuto.SelangSaat(status, bilGagal: 0, bilBelumSiap: 0));
    }

    /// <summary>
    /// Status "baik" tetapi kiraan menunjukkan sesuatu tertinggal (tugasan
    /// dilangkau / cubaan tidak disahkan) = masih ada kerja → pantas.
    /// </summary>
    [Theory]
    [InlineData(AliranPenghantaranMoeis.StatusTiadaPenghantaran, 0, 1)]
    [InlineData(AliranPenghantaranMoeis.StatusTiadaPenghantaran, 1, 0)]
    [InlineData(AliranPenghantaranMoeis.StatusDihantar, 1, 0)]
    [InlineData(AliranPenghantaranMoeis.StatusDihantar, 0, 3)]
    public void SelangSaat_StatusBaikTetapiAdaYangTertinggal_Pantas(string status, int bilGagal, int bilBelumSiap)
    {
        Assert.Equal(KitaranAuto.SelangCepatSaat, KitaranAuto.SelangSaat(status, bilGagal, bilBelumSiap));
    }

    /// <summary>
    /// Tiada maklumat (tiada pass penghantaran, gate ditolak, penghantaran
    /// dimatikan, status tidak dikenali) TIDAK BOLEH mempercepat kitaran secara
    /// senyap — lebih banyak aktiviti portal mesti berasaskan bukti.
    /// </summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(AliranPenghantaranMoeis.StatusDimatikan)]
    [InlineData("status-entah-apa")]
    public void SelangSaat_TiadaMaklumat_Perlahan(string? status)
    {
        Assert.Equal(KitaranAuto.SelangBiasaSaat, KitaranAuto.SelangSaat(status, bilGagal: 0, bilBelumSiap: 0));
        // Kiraan tanpa status yang dikenali juga tidak mempercepat.
        Assert.Equal(KitaranAuto.SelangBiasaSaat, KitaranAuto.SelangSaat(status, bilGagal: 4, bilBelumSiap: 4));
    }

    [Fact]
    public void SelangSaat_KiraanNegatif_DianggapSifar()
    {
        Assert.Equal(KitaranAuto.SelangBiasaSaat,
            KitaranAuto.SelangSaat(AliranPenghantaranMoeis.StatusDihantar, bilGagal: -1, bilBelumSiap: -5));
    }

    // ---------- SelangSaat(HasilHantarKerja) — kiraan dibaca daripada hasil sebenar ----------

    private static HasilPenghantaran Satu(bool berjaya) => new()
    {
        Status = berjaya ? "disahkan" : "halaman-tidak-sedia",
        Berjaya = berjaya,
        Sebab = "ujian",
        Kelas = "KELAS UJIAN",
        TarikhIso = "2026-10-06",
    };

    [Fact]
    public void SelangSaatHasil_Null_Perlahan()
    {
        Assert.Equal(KitaranAuto.SelangBiasaSaat, KitaranAuto.SelangSaat((HasilHantarKerja?)null));
    }

    [Fact]
    public void SelangSaatHasil_SemuaDisahkan_Perlahan()
    {
        var hasil = new HasilHantarKerja(AliranPenghantaranMoeis.StatusDihantar, "ok", 2, 0,
            new[] { Satu(true), Satu(true) });

        Assert.Equal(KitaranAuto.SelangBiasaSaat, KitaranAuto.SelangSaat(hasil));
    }

    [Fact]
    public void SelangSaatHasil_SatuGagal_Pantas()
    {
        var hasil = new HasilHantarKerja(AliranPenghantaranMoeis.StatusGagal, "x", 2, 0,
            new[] { Satu(true), Satu(false) });

        Assert.Equal(KitaranAuto.SelangCepatSaat, KitaranAuto.SelangSaat(hasil));
    }

    [Fact]
    public void SelangSaatHasil_TiadaPenghantaranTetapiAdaDilangkau_Pantas()
    {
        var hasil = new HasilHantarKerja(AliranPenghantaranMoeis.StatusTiadaPenghantaran, "x", 0, 1,
            Array.Empty<HasilPenghantaran>());

        Assert.Equal(KitaranAuto.SelangCepatSaat, KitaranAuto.SelangSaat(hasil));
    }

    [Fact]
    public void SelangSaatHasil_TiadaPenghantaranKosong_Perlahan()
    {
        var hasil = new HasilHantarKerja(AliranPenghantaranMoeis.StatusTiadaPenghantaran, "x", 0, 0,
            Array.Empty<HasilPenghantaran>());

        Assert.Equal(KitaranAuto.SelangBiasaSaat, KitaranAuto.SelangSaat(hasil));
    }
}
