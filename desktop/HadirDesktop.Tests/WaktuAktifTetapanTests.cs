using System;
using System.IO;
using System.Text;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Medan waktu aktif dalam <c>idme-login.json</c> (1.0.15). Fail yang SAMA
/// memegang opt-in sedia ada, jadi ujian ini menjaga dua perkara: medan
/// baharu boleh dibaca/ditulis, dan medan LAMA tidak pernah hilang atau
/// bertukar apabila medan baharu wujud (atau tiada) dalam fail.
/// </summary>
public class WaktuAktifTetapanTests : IDisposable
{
    private readonly string _dir;
    private readonly string _laluan;
    private readonly JsonIdMeLoginSettingsStore _stor;

    public WaktuAktifTetapanTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-waktuaktif-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _laluan = Path.Combine(_dir, "idme-login.json");
        _stor = new JsonIdMeLoginSettingsStore(_laluan);
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best-effort */ }
    }

    [Fact]
    public void FailTiada_LalaiKonservatif_CiriMati()
    {
        var t = _stor.Baca();

        Assert.False(t.WaktuAktifDidayakan);
        Assert.Equal("06:30", t.WaktuAktifMula);
        Assert.Equal("17:00", t.WaktuAktifTamat);
        Assert.True(t.WaktuAktifIsninJumaat);
    }

    [Fact]
    public void FailRosak_LalaiKonservatif_CiriMati()
    {
        File.WriteAllText(_laluan, "{ ini bukan json", Encoding.UTF8);

        var t = _stor.Baca();

        Assert.False(t.WaktuAktifDidayakan);
        Assert.False(t.LoginAuto);
        Assert.False(t.HantarAuto);
    }

    [Fact]
    public void RoundTrip_MedanBaharu()
    {
        _stor.Simpan(new IdMeLoginTetapan
        {
            WaktuAktifDidayakan = true,
            WaktuAktifMula = "22:00",
            WaktuAktifTamat = "06:30",
            WaktuAktifIsninJumaat = false,
        });

        var t = _stor.Baca();

        Assert.True(t.WaktuAktifDidayakan);
        Assert.Equal("22:00", t.WaktuAktifMula);
        Assert.Equal("06:30", t.WaktuAktifTamat);
        Assert.False(t.WaktuAktifIsninJumaat);
    }

    /// <summary>
    /// Fail 1.0.14 (tiada medan waktu aktif): medan lama kekal, medan baharu
    /// mengambil lalai — ciri MATI, jadi naik taraf tidak mengubah tingkah laku.
    /// </summary>
    [Fact]
    public void FailLama_TanpaMedanBaharu_MedanLamaKekal_CiriMati()
    {
        File.WriteAllText(_laluan,
            "{\"LoginAuto\":true,\"BenarkanTerusTanpaFrasa\":true,\"MaksPenolakanBerturut\":3,\"HantarAuto\":true}",
            Encoding.UTF8);

        var t = _stor.Baca();

        Assert.True(t.LoginAuto);
        Assert.True(t.BenarkanTerusTanpaFrasa);
        Assert.Equal(3, t.MaksPenolakanBerturut);
        Assert.True(t.HantarAuto);
        Assert.False(t.WaktuAktifDidayakan);
        Assert.Equal("06:30", t.WaktuAktifMula);
        Assert.Equal("17:00", t.WaktuAktifTamat);
        Assert.True(t.WaktuAktifIsninJumaat);
    }

    [Fact]
    public void TulisMedanBaharu_MedanLamaTidakHilang()
    {
        _stor.Simpan(new IdMeLoginTetapan
        {
            LoginAuto = true,
            BenarkanTerusTanpaFrasa = true,
            MaksPenolakanBerturut = 7,
            HantarAuto = true,
        });

        var t = _stor.Baca();
        t.WaktuAktifDidayakan = true;
        t.WaktuAktifMula = "07:00";
        _stor.Simpan(t);

        var dibaca = _stor.Baca();
        Assert.True(dibaca.LoginAuto);
        Assert.True(dibaca.BenarkanTerusTanpaFrasa);
        Assert.Equal(7, dibaca.MaksPenolakanBerturut);
        Assert.True(dibaca.HantarAuto);
        Assert.True(dibaca.WaktuAktifDidayakan);
        Assert.Equal("07:00", dibaca.WaktuAktifMula);
        Assert.Equal("17:00", dibaca.WaktuAktifTamat);
    }

    /// <summary>
    /// Masa yang rosak dalam fail tidak ditukar diam-diam kepada lalai: ia
    /// dibaca seadanya dan GATE menolaknya (gagal tertutup), bukan tetapan.
    /// </summary>
    [Fact]
    public void MasaRosakDalamFail_DibacaSeadanya_GateMenolak()
    {
        File.WriteAllText(_laluan,
            "{\"HantarAuto\":true,\"WaktuAktifDidayakan\":true,\"WaktuAktifMula\":\"pagi\",\"WaktuAktifTamat\":\"17:00\"}",
            Encoding.UTF8);

        var t = _stor.Baca();

        Assert.True(t.WaktuAktifDidayakan);
        Assert.Equal("pagi", t.WaktuAktifMula);
        Assert.False(KitaranAuto.WaktuAktifLulus(
            new DateTime(2026, 10, 6, 10, 0, 0, DateTimeKind.Local),
            t.WaktuAktifDidayakan, t.WaktuAktifMula, t.WaktuAktifTamat, t.WaktuAktifIsninJumaat));
    }

    /// <summary>Medan waktu aktif bukan rahsia — tiada kredensial masuk ke fail ini.</summary>
    [Fact]
    public void FailTetapan_TiadaMedanKredensial()
    {
        _stor.Simpan(new IdMeLoginTetapan { WaktuAktifDidayakan = true });

        var json = File.ReadAllText(_laluan, Encoding.UTF8);

        Assert.Contains("WaktuAktifDidayakan", json);
        Assert.DoesNotContain("KataLaluan", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Kunci", json, StringComparison.OrdinalIgnoreCase);
    }
}
