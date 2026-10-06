using System;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Gate tetingkap waktu aktif (1.0.15) — fungsi TULEN, jadi setiap sempadan
/// boleh dikunci tanpa jam sebenar. Peraturan yang dijaga:
///
///   * ciri MATI = sentiasa lulus (lalai tidak mengubah tingkah laku);
///   * masa yang tidak dapat dibaca = TIDAK lulus (gagal tertutup);
///   * tetingkap [mula, tamat): tepat pada mula lulus, tepat pada tamat tidak;
///   * tetingkap melintasi tengah malam (mula &gt; tamat) disokong;
///   * Isnin–Jumaat sahaja = Sabtu/Ahad (hari kalendar SEMASA) tidak lulus.
/// </summary>
public class WaktuAktifTests
{
    // 6 Okt 2026 ialah hari Selasa.
    private static DateTime Pada(int hari, int jam, int minit, int saat = 0) =>
        new(2026, 10, hari, jam, minit, saat, DateTimeKind.Local);

    private static readonly DateTime Selasa = Pada(6, 10, 0);
    private static readonly DateTime Sabtu = Pada(10, 10, 0);
    private static readonly DateTime Ahad = Pada(11, 10, 0);
    private static readonly DateTime Jumaat = Pada(9, 10, 0);
    private static readonly DateTime Isnin = Pada(5, 10, 0);

    [Fact]
    public void TarikhUjian_HariYangDijangka()
    {
        Assert.Equal(DayOfWeek.Tuesday, Selasa.DayOfWeek);
        Assert.Equal(DayOfWeek.Saturday, Sabtu.DayOfWeek);
        Assert.Equal(DayOfWeek.Sunday, Ahad.DayOfWeek);
        Assert.Equal(DayOfWeek.Friday, Jumaat.DayOfWeek);
        Assert.Equal(DayOfWeek.Monday, Isnin.DayOfWeek);
    }

    [Fact]
    public void Lalai_Tetapan_06301700_IsninJumaat_CiriMati()
    {
        var t = new IdMeLoginTetapan();

        Assert.False(t.WaktuAktifDidayakan);
        Assert.Equal("06:30", t.WaktuAktifMula);
        Assert.Equal("17:00", t.WaktuAktifTamat);
        Assert.True(t.WaktuAktifIsninJumaat);
    }

    // ---------- ciri mati ----------

    [Theory]
    [InlineData("06:30", "17:00")]
    [InlineData("rosak", "juga-rosak")]
    [InlineData(null, null)]
    [InlineData("", "")]
    public void TidakDidayakan_SentiasaLulus_WalaupunMasaRosakAtauHujungMinggu(string? mula, string? tamat)
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Pada(10, 3, 0), false, mula, tamat, true));
        Assert.True(KitaranAuto.WaktuAktifLulus(Selasa, false, mula, tamat, true));
    }

    // ---------- tetingkap biasa ----------

    [Fact]
    public void DalamTetingkap_Lulus()
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Selasa, true, "06:30", "17:00", true));
    }

    [Fact]
    public void SebelumMula_TidakLulus()
    {
        Assert.False(KitaranAuto.WaktuAktifLulus(Pada(6, 6, 29, 59), true, "06:30", "17:00", true));
        Assert.False(KitaranAuto.WaktuAktifLulus(Pada(6, 0, 0), true, "06:30", "17:00", true));
    }

    [Fact]
    public void TepatPadaMula_Lulus()
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Pada(6, 6, 30), true, "06:30", "17:00", true));
    }

    [Fact]
    public void SeminitSebelumTamat_Lulus()
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Pada(6, 16, 59, 59), true, "06:30", "17:00", true));
    }

    /// <summary>Tamat adalah EKSKLUSIF: 17:00 tepat sudah di luar waktu.</summary>
    [Fact]
    public void TepatPadaTamat_TidakLulus()
    {
        Assert.False(KitaranAuto.WaktuAktifLulus(Pada(6, 17, 0), true, "06:30", "17:00", true));
        Assert.False(KitaranAuto.WaktuAktifLulus(Pada(6, 23, 59), true, "06:30", "17:00", true));
    }

    // ---------- hari ----------

    [Fact]
    public void IsninJumaat_HujungMinggu_TidakLulus()
    {
        Assert.False(KitaranAuto.WaktuAktifLulus(Sabtu, true, "06:30", "17:00", true));
        Assert.False(KitaranAuto.WaktuAktifLulus(Ahad, true, "06:30", "17:00", true));
    }

    [Fact]
    public void IsninJumaat_HariBekerja_Lulus()
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Isnin, true, "06:30", "17:00", true));
        Assert.True(KitaranAuto.WaktuAktifLulus(Jumaat, true, "06:30", "17:00", true));
    }

    [Fact]
    public void TanpaIsninJumaat_HujungMinggu_Lulus()
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Sabtu, true, "06:30", "17:00", false));
        Assert.True(KitaranAuto.WaktuAktifLulus(Ahad, true, "06:30", "17:00", false));
    }

    // ---------- lintas tengah malam ----------

    [Fact]
    public void LintasTengahMalam_SelepasMula_Lulus()
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Pada(6, 22, 0), true, "22:00", "06:30", false));
        Assert.True(KitaranAuto.WaktuAktifLulus(Pada(6, 23, 59), true, "22:00", "06:30", false));
    }

    [Fact]
    public void LintasTengahMalam_SelepasTengahMalamSebelumTamat_Lulus()
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Pada(6, 0, 0), true, "22:00", "06:30", false));
        Assert.True(KitaranAuto.WaktuAktifLulus(Pada(6, 6, 29), true, "22:00", "06:30", false));
    }

    [Fact]
    public void LintasTengahMalam_TepatTamat_DanSiangHari_TidakLulus()
    {
        Assert.False(KitaranAuto.WaktuAktifLulus(Pada(6, 6, 30), true, "22:00", "06:30", false));
        Assert.False(KitaranAuto.WaktuAktifLulus(Pada(6, 12, 0), true, "22:00", "06:30", false));
        Assert.False(KitaranAuto.WaktuAktifLulus(Pada(6, 21, 59), true, "22:00", "06:30", false));
    }

    /// <summary>
    /// Hari dinilai pada tarikh kalendar SEMASA (paling ketat): Sabtu 02:00
    /// dalam tetingkap 22:00–06:30 tetap hujung minggu.
    /// </summary>
    [Fact]
    public void LintasTengahMalam_IsninJumaat_GunaHariSemasa()
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Pada(9, 23, 0), true, "22:00", "06:30", true));   // Jumaat malam
        Assert.False(KitaranAuto.WaktuAktifLulus(Pada(10, 2, 0), true, "22:00", "06:30", true));  // Sabtu pagi
        Assert.True(KitaranAuto.WaktuAktifLulus(Pada(5, 2, 0), true, "22:00", "06:30", true));    // Isnin pagi
    }

    // ---------- gagal tertutup ----------

    [Theory]
    [InlineData(null, "17:00")]
    [InlineData("06:30", null)]
    [InlineData("", "17:00")]
    [InlineData("   ", "17:00")]
    [InlineData("6:30", "17:00")]
    [InlineData("06:3", "17:00")]
    [InlineData("24:00", "17:00")]
    [InlineData("06:60", "17:00")]
    [InlineData("0630", "17:00")]
    [InlineData("06.30", "17:00")]
    [InlineData("06:30:00", "17:00")]
    [InlineData("-6:30", "17:00")]
    [InlineData("06:30", "lima petang")]
    [InlineData("٠٦:٣٠", "17:00")]
    public void MasaTidakSah_TidakLulus(string? mula, string? tamat)
    {
        Assert.False(KitaranAuto.WaktuAktifLulus(Selasa, true, mula, tamat, false));
    }

    /// <summary>
    /// Mula == tamat adalah kabur (kosong atau 24 jam?) — tidak diteka, jadi
    /// gagal tertutup.
    /// </summary>
    [Fact]
    public void MulaSamaDenganTamat_TidakLulus()
    {
        Assert.False(KitaranAuto.WaktuAktifLulus(Selasa, true, "08:00", "08:00", false));
        Assert.False(KitaranAuto.WaktuAktifLulus(Pada(6, 8, 0), true, "08:00", "08:00", false));
    }

    [Fact]
    public void RuangDiHujung_Diterima()
    {
        Assert.True(KitaranAuto.WaktuAktifLulus(Selasa, true, " 06:30 ", "17:00\t", false));
    }

    [Theory]
    [InlineData("06:30", true)]
    [InlineData("00:00", true)]
    [InlineData("23:59", true)]
    [InlineData("24:00", false)]
    [InlineData("7:00", false)]
    [InlineData(null, false)]
    [InlineData("", false)]
    public void MasaSah_FormatHHmmKetat(string? teks, bool dijangka)
    {
        Assert.Equal(dijangka, KitaranAuto.MasaSah(teks));
    }

    // ---------- teks sebab untuk label ----------

    [Fact]
    public void SebabLuarWaktu_MenyebutTetingkapDanHari()
    {
        var sebab = KitaranAuto.SebabLuarWaktuAktif("06:30", "17:00", isninJumaat: true);

        Assert.StartsWith("di luar waktu aktif (06:30–17:00", sebab);
        Assert.Contains("Isnin–Jumaat", sebab);
    }

    [Fact]
    public void SebabLuarWaktu_TanpaHadHari_TidakMenyebutIsninJumaat()
    {
        var sebab = KitaranAuto.SebabLuarWaktuAktif("06:30", "17:00", isninJumaat: false);

        Assert.StartsWith("di luar waktu aktif (06:30–17:00)", sebab);
        Assert.DoesNotContain("Isnin", sebab);
    }

    [Fact]
    public void SebabLuarWaktu_MasaRosak_MengakuTetapanTidakSah()
    {
        var sebab = KitaranAuto.SebabLuarWaktuAktif("rosak", "17:00", isninJumaat: true);

        Assert.Contains("tidak sah", sebab);
        Assert.DoesNotContain("rosak", sebab);   // nilai mentah tidak dipaparkan semula
    }
}
